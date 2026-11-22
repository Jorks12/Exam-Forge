import { Fragment, lazy, Suspense } from 'react';

const MathFormula = lazy(() => import('./math-formula'));
const delimiters = /(?<!\\)(?:\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$)/g;

export function MathText({ text }: { text: string }) {
  const formulas = [...text.matchAll(delimiters)];
  if (!formulas.length) return text;
  let offset = 0;
  const parts = formulas.map(match => {
    const [source, inline, block, dollars] = match;
    const plain = text.slice(offset, match.index);
    offset = match.index + source.length;
    return <Fragment key={match.index}>{plain}<Suspense fallback={source}>
      <MathFormula formula={inline ?? block ?? dollars} displayMode={!inline} source={source} />
    </Suspense></Fragment>;
  });
  return <span className="math-text">{parts}{text.slice(offset)}</span>;
}
