"use client";

type Props = {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  selectName?: string;
  selectTitle?: string;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
};

export default function EditableList({
  items,
  onChange,
  placeholder,
  addLabel = "Tambah",
  selectName,
  selectTitle,
  selectedIndex,
  onSelect,
}: Props) {
  const update = (index: number, value: string) =>
    onChange(items.map((item, i) => (i === index ? value : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const add = () => onChange([...items, ""]);

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          {onSelect ? (
            <input
              type="radio"
              name={selectName ?? "editable-list-select"}
              checked={selectedIndex === index}
              onChange={() => onSelect(index)}
              title={selectTitle}
              className="mt-2.5 h-4 w-4 shrink-0 accent-indigo-600"
            />
          ) : null}
          <textarea
            value={item}
            onChange={(e) => update(index, e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="button"
            onClick={() => remove(index)}
            className="mt-1 shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-red-300 hover:text-red-600"
          >
            Hapus
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600"
      >
        + {addLabel}
      </button>
    </div>
  );
}
