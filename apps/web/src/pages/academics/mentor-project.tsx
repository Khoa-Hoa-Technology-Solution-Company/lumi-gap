import { Link, useParams, useSearchParams } from "react-router-dom";
import { MentorAccessWorkspace } from "@/features/projects/components/mentor-access-workspace";
import { MentorProjectWorkspace } from "@/features/projects/components/mentor-project-workspace";
import { useMentorProjectEntry } from "@/features/projects/hooks/use-mentor-project-entry";
import { Skeleton } from "@/components/ui/skeleton";
import "./mentor-project.css";

export function MentorProjectPage({ embedded = false }: { embedded?: boolean }) {
  const Container = embedded ? "section" : "main";
  const route = useParams();
  const [params] = useSearchParams();
  const projectId = embedded ? params.get("projectId") ?? undefined : route.projectId;
  const entry = useMentorProjectEntry(projectId);
  if (entry.isLoading) return <Container className="mentor-project-page" role="status"><Skeleton className="h-10 w-64" /><Skeleton className="mt-5 h-64 w-full" /><span className="sr-only">Đang tải không gian cố vấn…</span></Container>;
  if (entry.data && !entry.error && (embedded ? params.get("section") : params.get("view")) !== "resources") return <Container className="mentor-project-page">{embedded && ["tasks", "chat"].includes(params.get("tab") ?? "") && <h1 className="mb-4 break-words text-2xl font-semibold">{entry.data.title}</h1>}<MentorProjectWorkspace data={entry.data} standalone embedded={embedded} /></Container>;
  return <Container className="mentor-project-page" data-no-i18n><Link className="mentor-project-back" to={embedded ? "/mentor-workspace?view=projects" : "/academic-support?view=active"}>Về danh sách nhóm đang cố vấn</Link>{projectId && <MentorAccessWorkspace key={projectId} projectId={projectId} mentorView />}</Container>;
}
