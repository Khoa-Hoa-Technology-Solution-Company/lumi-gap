import ReactMarkdown from "react-markdown";

export function SubmissionIntroductionView({ content }: { content: string }) {
  return <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm leading-7 [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"><ReactMarkdown skipHtml components={{ img: () => null, a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{content}</ReactMarkdown></div>;
}
