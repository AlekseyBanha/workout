import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { AdminExercisesPage } from "./pages/admin/Exercises.tsx";
import { AdminUsersPage } from "./pages/admin/Users.tsx";
import { ExerciseDetailPage } from "./pages/ExerciseDetail.tsx";
import { ExercisesPage } from "./pages/Exercises.tsx";
import { HistoryPage } from "./pages/History.tsx";
import { LoginPage } from "./pages/Login.tsx";
import { WorkoutPage } from "./pages/Workout.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/exercises" replace />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
          <Route path="/workout" element={<WorkoutPage />} />
          <Route path="/workout/:id" element={<WorkoutPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route element={<ProtectedRoute admin />}>
            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/exercises" element={<AdminExercisesPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/exercises" replace />} />
    </Routes>
  );
}
