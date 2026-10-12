export function BilingualText({ en, my }: { en: string; my: string }) {
  return (
    <div data-preview-bilingual>
      <div lang="en" data-preview-language="en" className="text-muted-foreground">
        {en.split(/\n\s*\n/).map((paragraph, index) => (
          <p key={index} lang="en">
            {paragraph}
          </p>
        ))}
      </div>
      <div lang="my" data-preview-language="my" className="text-muted-foreground">
        {my.split(/\n\s*\n/).map((paragraph, index) => (
          <p key={index} lang="my">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
