import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Strikethrough, List, ListOrdered, Code, SquareCode, Quote, Undo2, Redo2, RemoveFormatting } from "lucide-react";
import { useEffect } from "react";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export function RichTextEditor({ id, label, value, onChange, error, disabled = false }: Props) {
  const safeValue = value ?? "";

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],
    content: safeValue,
    editable: !disabled,
    onUpdate: ({ editor: current }) => {
      if (!current || current.isDestroyed) return;
      onChange(current.isEmpty ? "" : current.getHTML());
    },
    editorProps: { attributes: { class: "rich-content rich-text-input", role: "textbox", "aria-multiline": "true", "aria-labelledby": `${id}-label` } },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current || current.isDestroyed) return null;
      return {
        bold: current.isActive("bold"), italic: current.isActive("italic"), strike: current.isActive("strike"),
        bullet: current.isActive("bulletList"), ordered: current.isActive("orderedList"), code: current.isActive("code"),
        block: current.isActive("codeBlock"), quote: current.isActive("blockquote"),
        heading: [1, 2, 3].find((level) => current.isActive("heading", { level })) ?? 0,
        undo: current.can().undo(), redo: current.can().redo(),
      };
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const currentHtml = editor.getHTML();
    if (safeValue !== currentHtml && !(safeValue === "" && editor.isEmpty)) {
      editor.commands.setContent(safeValue, { emitUpdate: false });
    }
  }, [editor, safeValue]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          class: "rich-content rich-text-input",
          role: "textbox",
          "aria-multiline": "true",
          "aria-labelledby": `${id}-label`,
          "aria-invalid": String(Boolean(error)),
          "aria-describedby": `${id}-hint${error ? ` ${id}-error` : ""}`,
        },
      },
    });
  }, [editor, error, id]);

  const actions = editor && !editor.isDestroyed && state ? [
    { label: "Bold", icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Strikethrough", icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run() },
    { label: "Bullet list", icon: List, active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: state.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Inline code", icon: Code, active: state.code, run: () => editor.chain().focus().toggleCode().run() },
    { label: "Code block", icon: SquareCode, active: state.block, run: () => editor.chain().focus().toggleCodeBlock().run() },
    { label: "Quote", icon: Quote, active: state.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: "Clear formatting", icon: RemoveFormatting, run: () => editor.chain().focus().clearNodes().unsetAllMarks().run() },
    { label: "Undo", icon: Undo2, disabled: !state.undo, run: () => editor.chain().focus().undo().run() },
    { label: "Redo", icon: Redo2, disabled: !state.redo, run: () => editor.chain().focus().redo().run() },
  ] : [];

  return <div className="rich-text-field full">
    <span className="rich-text-label" id={`${id}-label`}>{label}</span>
    <div className={`rich-text-editor ${error ? "invalid" : ""}`}>
      <div className="rich-text-toolbar" role="group" aria-label={`${label} formatting`}>
        <select aria-label={`${label} text style`} value={state?.heading ?? 0} disabled={disabled || !editor || editor.isDestroyed} onChange={(event) => {
          if (!editor || editor.isDestroyed) return;
          const level = Number(event.target.value);
          if (level === 0) editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run();
        }}><option value="0">Normal text</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option></select>
        {actions.map((action) => <button type="button" key={action.label} title={action.label} aria-label={action.label} aria-pressed={action.active} disabled={disabled || action.disabled} onMouseDown={(event) => event.preventDefault()} onClick={action.run}><action.icon size={16} /></button>)}
      </div>
      <EditorContent editor={editor} />
    </div>
    <small id={`${id}-hint`}>Use code blocks for commands and .env examples. Press Ctrl/Cmd + Enter to leave a code block.</small>
    {error && <small className="field-error" id={`${id}-error`}>{error}</small>}
  </div>;
}
