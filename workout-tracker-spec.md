# ТЗ: PWA-трекер тренировок с админ-панелью

## 1. Цель

Мобильное PWA для записи тренировок (упражнение → подходы → вес × повторы) и отслеживания прогрессии. Есть админ-панель: админ создаёт пользователей и ведёт каталог упражнений с фото. Всё должно работать на **бесплатных тарифах**.

## 2. Стек (не менять без причины)

- Frontend: **Vite + React + TypeScript**, **Tailwind CSS**, React Router
- PWA: `vite-plugin-pwa` (manifest, иконки, service worker, установка на экран «Домой» на iOS)
- Backend: **Supabase** (Postgres, Auth, Storage, Edge Functions)
- Клиент: `@supabase/supabase-js`
- Хостинг фронта: Cloudflare Pages или GitHub Pages
- Язык интерфейса: украинский (строки вынести в один файл `i18n/uk.ts`, чтобы легко менять)

## 3. Роли

- `admin`: всё, что умеет user, плюс доступ к `/admin`
- `user`: видит каталог упражнений, ведёт свои тренировки и видит только свои данные

Публичная регистрация **отключена** (Supabase Auth → Disable signups). Пользователей создаёт только админ.

## 4. Модель данных (SQL-миграция в `supabase/migrations/`)

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('admin','user')),
  created_at timestamptz not null default now()
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,              -- грудь, спина, ноги, плечи, руки, пресс и т.д.
  description text,
  image_path text,                -- путь в Storage bucket exercise-images
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  performed_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_number int not null,
  weight numeric(6,2) not null,   -- кг, шаг 0.5
  reps int not null,
  created_at timestamptz not null default now()
);

create index on workout_sets (user_id, exercise_id, created_at desc);
```

Триггер `on auth.users insert` создаёт строку в `profiles` (role = `user`).

### RLS (обязательно включить на всех таблицах)

- `profiles`: пользователь читает свою строку; админ читает все. Менять `role` с клиента нельзя.
- `exercises`: SELECT для любого authenticated; INSERT/UPDATE/DELETE только админу.
- `workouts`, `workout_sets`: пользователь работает только со строками, где `user_id = auth.uid()`.
- Хелпер: SQL-функция `is_admin()` (security definer), которую используют политики.

### Storage

- Bucket `exercise-images`, публичное чтение.
- Загрузка, замена и удаление файлов только для админа (политика через `is_admin()`).

## 5. Создание пользователей (важно для безопасности)

`service_role` ключ **никогда** не попадает во фронтенд.

Сделать Edge Functions (Deno):

- `admin-create-user`: принимает `{ email, password, display_name, role }`
- `admin-delete-user`: принимает `{ user_id }`
- `admin-reset-password`: принимает `{ user_id, new_password }`

Каждая функция:
1. Берёт JWT вызывающего из заголовка Authorization.
2. Проверяет в `profiles`, что он `admin`; иначе возвращает 403.
3. Вызывает `supabase.auth.admin.*` через service role (ключ берётся из secrets функции).

Первого админа создать вручную (SQL-скрипт или инструкция в README): создать юзера в Supabase Dashboard и выставить `role = 'admin'`.

## 6. Админ-панель (`/admin`, этап 1, приоритет)

Доступ: только `role = 'admin'`, иначе редирект на главную.

### 6.1 Пользователи (`/admin/users`)
- Таблица: email, имя, роль, дата создания.
- Кнопка «Створити користувача»: форма (email, пароль, имя, роль), вызывает `admin-create-user`.
- Действия: сменить пароль, удалить (с подтверждением).

### 6.2 Упражнения (`/admin/exercises`)
- Список карточек или таблица: фото-миниатюра, название, группа мышц. Поиск по названию, фильтр по группе мышц.
- Создание и редактирование: название (обязательно), группа мышц (select), описание, фото.
- Загрузка фото:
  - выбор файла или съёмка камерой (`<input type="file" accept="image/*" capture>`);
  - **сжатие на клиенте** перед загрузкой: максимум 1024 px по длинной стороне, WebP, качество ~0.8, цель до 200 КБ (экономим бесплатный лимит 1 ГБ);
  - превью до сохранения;
  - при замене или удалении упражнения старый файл удаляется из Storage.
- Удаление упражнения: если по нему есть `workout_sets`, запретить удаление и показать понятное сообщение.

## 7. Пользовательская часть (этап 2)

### 7.1 Вход
- Страница логина (email + пароль), сессия сохраняется.

### 7.2 Каталог (`/exercises`)
- Сетка упражнений с фото, поиск, фильтр по группе мышц.
- Страница упражнения: фото, описание, **история подходов** и график.

### 7.3 Тренировка (`/workout`)
- Кнопка «Почати тренування» создаёт `workouts` на сегодня.
- Добавление упражнения из каталога (поиск).
- Для каждого упражнения: список подходов, добавление подхода (вес, повторы). Поля числовые, крупные, удобные для ввода одной рукой.
- **Автоподстановка**: при добавлении упражнения показать «Минулого разу» (все подходы из предыдущей тренировки) и подставить в новый подход прошлый вес и повторы.
- **Подсказка прогрессии (двойная прогрессия)**: диапазон повторов по умолчанию 8-12. Если во всех подходах прошлой тренировки достигнут верх диапазона, подсказать «Спробуй +2.5 кг», иначе «Спробуй +1 повтор». Диапазон и шаг веса настраиваемые.
- Редактирование и удаление подходов, редактирование тренировки задним числом.

### 7.4 История и прогресс
- Список тренировок по датам.
- График по упражнению: максимальный вес и расчётный 1RM (формула Эпли) по датам. Библиотека: `recharts`.

## 8. Нефункциональные требования

- Mobile-first, основная платформа iPhone Safari и установленное PWA. Тёмная тема по умолчанию.
- Офлайн: оболочка приложения и каталог кэшируются. Запись подходов без сети можно отложить на этап 3 (очередь синхронизации).
- Валидация форм на клиенте (zod), понятные сообщения об ошибках.
- Состояния loading / empty / error на всех экранах.
- Секреты только в `.env` (в репозиторий добавить `.env.example`), в клиенте только `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.

## 9. Защита от автопаузы Supabase Free

Бесплатные проекты Supabase засыпают после 7 дней неактивности. Добавить GitHub Action (`.github/workflows/keepalive.yml`) с cron раз в 3 дня, который делает простой запрос к REST API (например, select из `exercises` с `limit 1`). URL и anon key берутся из GitHub Secrets.

## 10. Структура проекта

```
/src
  /pages (Login, Exercises, ExerciseDetail, Workout, History, admin/Users, admin/Exercises)
  /components
  /lib (supabase client, image compression, progression logic)
  /i18n/uk.ts
/supabase
  /migrations
  /functions (admin-create-user, admin-delete-user, admin-reset-password)
README.md (установка, создание проекта Supabase, первый админ, деплой)
```

## 11. Порядок работы для Cursor

1. Инициализировать проект, настроить Tailwind, PWA, роутинг.
2. Написать SQL-миграцию, RLS, storage-политики, триггер профиля.
3. Edge Functions для управления пользователями.
4. Логин и защита маршрутов (guard по роли).
5. Админка: пользователи, затем упражнения с загрузкой фото.
6. Пользовательская часть: каталог, тренировка, прогрессия, графики.
7. Keepalive Action, README, деплой.

Каждый шаг завершать рабочим состоянием приложения.

## 12. Критерии приёмки (этап 1)

- Админ входит, создаёт пользователя, и тот может войти со своими данными.
- Обычный пользователь не открывает `/admin` и не может вызвать Edge Functions (проверить 403).
- Админ создаёт упражнение с фото: файл в Storage сжат до ~200 КБ, фото отображается в списке.
- Замена фото удаляет старый файл; удаление упражнения без подходов работает, с подходами блокируется.
- Приложение устанавливается на экран «Домой» на iPhone и открывается как PWA.
- `service_role` ключа нет ни в коде фронтенда, ни в репозитории.
