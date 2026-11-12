import { Link, useParams, useSearchParams } from "react-router-dom";
import { MentorAccessWorkspace } from "@/features/projects/components/mentor-access-workspace";
import { MentorProjectWorkspace } from "@/features/projects/components/mentor-project-workspace";
import { useMentorProjectEntry } from "@/features/projects/hooks/use-mentor-project-entry";
import { Skeleton } from "@/components/ui/skeleton";
import "./mentor-project.css";

export function MentorProjectPage() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const entry = useMentorProjectEntry(projectId);
  if (entry.isLoading) return <main className="mentor-project-page" role="status"><Skeleton className="h-10 w-64" /><Skeleton className="mt-5 h-64 w-full" /><span className="sr-only">Đang tải không gian cố vấn…</span></main>;
  if (entry.data && !entry.error && params.get("view") !== "resources") return <main className="mentor-project-page"><MentorProjectWorkspace data={entry.data} standalone /></main>;
  return <main className="mentor-project-page" data-no-i18n><Link className="mentor-project-back" to="/academic-support?view=active">Về danh sách nhóm đang cố vấn</Link>{projectId && <MentorAccessWorkspace key={projectId} projectId={projectId} mentorView />}</main>;
}
