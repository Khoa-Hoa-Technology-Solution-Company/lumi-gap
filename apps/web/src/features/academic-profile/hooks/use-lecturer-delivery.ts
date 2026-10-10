import { useEffect, useState } from "react";
import { lecturerDeliveryStore, type LecturerDelivery } from "../services/lecturer-delivery-store";

export function useLecturerDelivery(userId?: string) {
  const [job, setJob] = useState<LecturerDelivery>();
  useEffect(() => {
    let active = true; setJob(undefined);
    if (!userId) return;
    const refresh = () => { void lecturerDeliveryStore.read(userId).then(value => { if (active) setJob(value); }).catch(() => { /* Enqueue reports storage failures in the form. */ }); };
    refresh();
    const timer = setInterval(refresh, 3000);
    window.addEventListener("lecturer-delivery-changed", refresh);
    window.addEventListener("online", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("lecturer-delivery-changed", refresh); window.removeEventListener("online", refresh); };
  }, [userId]);
  return job?.userId === userId ? job : undefined;
}
