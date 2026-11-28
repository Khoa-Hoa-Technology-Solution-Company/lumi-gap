import { PageHeader } from "@/components/page-header";
import { ApiKeyPool } from "@/features/admin/components/api-key-pool";

/** Admin → API Keys: the Gemini and OpenAlex key pools with automatic rotation. */
export function AdminApiKeysPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Platform Gemini and OpenAlex keys. Calls rotate to the next key automatically when one is rejected."
      />
      <ApiKeyPool />
    </div>
  );
}
