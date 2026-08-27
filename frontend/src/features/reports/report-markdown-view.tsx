import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const mdComponents: Partial<Components> = {
  a: ({ href, children, ...rest }) => (
    <a
      href={href}
      {...rest}
      {...(href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-4 w-full overflow-x-auto">
      <table className="w-full min-w-md border-collapse border border-border text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left">
        {children}
      </table>
    </div>
  ),
  img: ({ alt, src, ...rest }) => (
    <img
      alt={alt ?? ''}
      src={src}
      className="my-4 max-h-[min(480px,70vh)] max-w-full rounded-md border object-contain"
      {...rest}
    />
  ),
};

const bodyClass =
  'report-markdown-body max-w-none text-sm leading-relaxed text-foreground ' +
  '[&_p]:my-3 [&_p]:leading-relaxed ' +
  '[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:scroll-m-20 [&_h1]:border-b [&_h1]:border-border [&_h1]:pb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight first:[&_h1]:mt-0 ' +
  '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight ' +
  '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold ' +
  '[&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:text-base [&_h4]:font-semibold ' +
  '[&_ul]:my-3 [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:my-3 [&_ol]:ml-6 [&_ol]:list-decimal [&_li]:my-1 ' +
  '[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground ' +
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem] ' +
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs ' +
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit ' +
  '[&_a]:text-primary [&_a]:underline ' +
  '[&_hr]:my-8 [&_hr]:border-border ' +
  '[&_strong]:font-semibold';

export interface ReportMarkdownViewProps {
  markdown: string;
}

/** Renders persisted audit Markdown (GFM) without raw HTML — same safety posture as backend `markdown-it` with `html: false`. */
export function ReportMarkdownView({ markdown }: ReportMarkdownViewProps) {
  const source = markdown.replace(/<br\s*\/?>/gi, '\n');
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-muted/15 p-4 md:p-6">
      <div className={bodyClass}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {source}
        </ReactMarkdown>
      </div>
    </div>
  );
}
