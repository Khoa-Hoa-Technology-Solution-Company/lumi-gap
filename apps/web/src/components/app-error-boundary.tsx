import { Component, type ErrorInfo, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{ children: ReactNode; onRetry?: () => void }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[LumiGap] Rendering failed", error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    const vi = document.documentElement.lang.startsWith("vi");
    return <main lang={vi ? "vi" : "en"} data-no-i18n className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div role="alert" className="max-w-md space-y-4">
        <h1 className="text-xl font-semibold">{vi ? "Chưa thể hiển thị trang này" : "This page could not be displayed"}</h1>
        <p className="text-sm text-muted-foreground">{vi ? "Hãy tải lại trang để thử lại. Phiên đăng nhập của bạn vẫn được giữ." : "Reload the page to try again. Your sign-in session is preserved."}</p>
        <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => this.props.onRetry ? this.props.onRetry() : window.location.reload()}>{vi ? "Tải lại trang" : "Reload page"}</button>
      </div>
    </main>;
  }
}
