# Трекер тренувань

Мобільний PWA: каталог вправ, запис підходів і прогрес. Користувачів створює лише адмін. Інтерфейс українською.

## Стек

- Vite, React, TypeScript, Tailwind CSS, React Router
- PWA через `vite-plugin-pwa`
- Supabase: Postgres, Auth, Storage, Edge Functions
- Графіки: Recharts

У клієнті лише `VITE_SUPABASE_URL` і `VITE_SUPABASE_ANON_KEY`. Ключ `service_role` лишається в секретах Edge Functions і в репозиторій не потрапляє.

## Локальний запуск

Потрібен Node.js 20 або новіший.

```bash
npm install
cp .env.example .env
npm run dev
```

У `.env` вкажи URL проєкту і anon key з Supabase → Project Settings → API.

```bash
npm run build
npm run preview
```

## Проєкт Supabase

1. Створи проєкт на [supabase.com](https://supabase.com) (безкоштовний тариф).
2. Відкрий SQL Editor і виконай `supabase/migrations/20261028120000_init.sql`.
   Міграція створює таблиці, RLS, тригер профілю, бакет `exercise-images` і політики Storage.
   Або, якщо стоїть CLI: `supabase link` і `supabase db push`.
3. Authentication → Providers → Email → вимкни **Allow new users to sign up**.
4. Задеплой функції (ключ `service_role` CLI бере з проєкту сам, у фронт його не клади):

```bash
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
supabase functions deploy admin-reset-password
```

## Перший адмін

1. Authentication → Users → Add user. Вкажи пошту і пароль, увімкни Auto Confirm.
2. У SQL Editor виконай `supabase/scripts/promote-admin.sql`, підставивши свою пошту.
3. Увійди в застосунок цією поштою. З’явиться розділ «Адмін».

Далі користувачів створюй тільки з `/admin/users`. Роль з клієнта змінити не можна: це блокує тригер, а підвищення ролі робить Edge Function через `service_role`.

## Що є в інтерфейсі

- Вхід за поштою і паролем, сесія зберігається.
- `/exercises` — каталог, пошук, фільтр за групою м’язів.
- Сторінка вправи — опис, історія підходів, графік максимальної ваги і розрахункового 1ПМ (Еплі).
- `/workout` — «Почати тренування», вправи з каталогу, великі поля ваги і повторів.
  Для нової вправи показуються підходи «Минулого разу», у новий підхід підставляються минулі вага і повтори.
  Якщо в усіх підходах минулого разу досягнуто верх діапазону (за замовчуванням 8–12), підказка «Спробуй +2.5 кг», інакше «Спробуй +1 повтор». Діапазон і крок ваги змінюються в блоці «Прогресія».
- Дату тренування можна змінити заднім числом. Історія — `/history`.
- Адмін: користувачі (створення, зміна пароля, видалення) і вправи з фото.
  Фото стискається в браузері до 1024 px по довгій стороні, WebP, якість близько 0.8, ціль до 200 КБ.
  Заміна і видалення вправи прибирають старий файл зі Storage.
  Вправу з уже записаними підходами видалити не можна.

Звичайний користувач не відкриває `/admin`. Виклик Edge Functions без ролі адміна повертає 403.

## Офлайн і встановлення на iPhone

Сервіс-воркер кешує оболонку застосунку, запити каталогу вправ і публічні фото. Запис підходів без мережі в цій версії не відкладається.

Збірка віддає manifest (`standalone`), іконки 192/512 і `apple-touch-icon`. На iPhone: відкрий сайт по HTTPS у Safari → Поділитися → На Початковий екран. Іконка відкриває застосунок без панелі Safari.

Локальний `npm run dev` маніфест підключає, але service worker у розробці вимкнений. Перевіряй встановлення на зібраному HTTPS-сайті.

## Деплой фронта

Cloudflare Pages:

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

GitHub Pages теж підходить, якщо сайт відкривається з кореня домену (`base: '/'`). Для проєктного сайту `username.github.io/repo` у `vite.config.ts` треба виставити `base`.

## Щоб Supabase Free не засинав

Файл `.github/workflows/keepalive.yml` раз на 3 дні робить `select id limit 1` з `exercises`.

У секретах репозиторію GitHub:

- `SUPABASE_URL` — URL проєкту, без `/rest/v1`
- `SUPABASE_ANON_KEY` — anon key

Anon-ключ не читає рядки: для ролі `anon` немає RLS-політики, відповідь буде `[]` зі статусом 200. Цього достатньо, щоб проєкт не вважався неактивним, і каталог назовні не відкривається.
