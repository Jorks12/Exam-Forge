import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function MathFormula({ formula, displayMode, source }: {
  formula: string; displayMode: boolean; source: string;
}) {
  let html: string;
  try {
    html = katex.renderToString(formula, { displayMode, trust: false, maxExpand: 200, maxSize: 10 });
  } catch (error) {
    if (error instanceof katex.ParseError) return source;
    throw error;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
