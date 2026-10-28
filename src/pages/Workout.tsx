import { useParams } from "react-router";
import { WorkoutEditor } from "../components/workout/WorkoutEditor.tsx";
import { WorkoutHome } from "../components/workout/WorkoutHome.tsx";

export function WorkoutPage() {
  const { id } = useParams();
  if (id) return <WorkoutEditor key={id} id={id} />;
  return <WorkoutHome />;
}
