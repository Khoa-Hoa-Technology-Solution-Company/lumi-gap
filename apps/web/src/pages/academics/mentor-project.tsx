import { Link, useParams } from "react-router-dom";
import { MentorAccessWorkspace } from "@/features/projects/components/mentor-access-workspace";
import "./mentor-project.css";

export function MentorProjectPage() {
  const { projectId } = useParams();
  return <main className="mentor-project-page" data-no-i18n><Link className="mentor-project-back" to="/academic-support?view=active">Về danh sách nhóm đang cố vấn</Link>{projectId && <MentorAccessWorkspace key={projectId} projectId={projectId} mentorView />}</main>;
}
