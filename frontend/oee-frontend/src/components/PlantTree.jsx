import { useState } from 'react';

// ISA-95 ağaç menüsü: Fabrika > Hat > Makine.
// nodes: [{ id, level, children }] — bkz. src/data/plantTree.js
export default function PlantTree({ nodes, selectedId, onSelect }) {
  return (
    <nav className="agac" aria-label="Tesis hiyerarşisi">
      <h2 className="agac-baslik">Tesis</h2>
      <ul role="tree">
        {nodes.map((n) => (
          <TreeNode key={n.id} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </ul>
    </nav>
  );
}

function TreeNode({ node, depth, selectedId, onSelect }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const selected = node.id === selectedId;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={selected}>
      <div className={selected ? 'agac-satir secili' : 'agac-satir'} style={{ paddingLeft: 8 + depth * 18 }}>
        {hasChildren ? (
          <button
            type="button"
            className="agac-ok"
            onClick={() => setOpen(!open)}
            aria-label={open ? `${node.id} daralt` : `${node.id} genişlet`}
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          </button>
        ) : (
          <span className="agac-ok bos" aria-hidden="true" />
        )}
        <button type="button" className="agac-ad" onClick={() => onSelect?.(node.id)}>
          <span className="agac-seviye">{node.level}</span>
          <span translate="no">{node.id}</span>
        </button>
      </div>
      {hasChildren && open && (
        <ul role="group">
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}
