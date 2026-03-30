import { useState } from "react";

type TaskFormProps = {
  onSubmit: (payload: { title: string; description: string; priority: string; tags: string[] }) => Promise<void>;
  onCancel: () => void;
};

export function TaskForm({ onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    
    // Optimistically disable while keeping form data visible
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        priority,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean)
      });
      // Clear only on success
      setTitle("");
      setDescription("");
      setTags("");
    } catch (err) {
      console.error("Task creation failed:", err);
      // Keep data so user can retry
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="task-form-container" style={{ padding: "1.5rem", backgroundColor: "var(--surface)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
      <h2 style={{ marginTop: 0, marginBottom: "1.5rem" }}>Create New Task</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label className="form-field">
          <span>Title</span>
          <input 
            type="text" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            placeholder="e.g. Scrape latest documentation"
            required
            autoFocus
            style={{ width: "100%", padding: "0.5rem", borderRadius: "0.25rem", border: "1px solid var(--border)", backgroundColor: "var(--bg)" }}
          />
        </label>

        <label className="form-field">
          <span>Description</span>
          <textarea 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Detailed instructions for the worker..."
            required
            rows={5}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "0.25rem", border: "1px solid var(--color-border)", backgroundColor: "var(--color-background)", fontFamily: "inherit" }}
          />
        </label>

        <div style={{ display: "flex", gap: "1rem" }}>
          <label className="form-field" style={{ flex: 1 }}>
            <span>Priority</span>
            <select 
              value={priority} 
              onChange={e => setPriority(e.target.value)}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "0.25rem", border: "1px solid var(--border)", backgroundColor: "var(--bg)" }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label className="form-field" style={{ flex: 1 }}>
            <span>Tags (comma separated)</span>
            <input 
              type="text" 
              value={tags} 
              onChange={e => setTags(e.target.value)} 
              placeholder="e.g. data, urgent"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "0.25rem", border: "1px solid var(--border)", backgroundColor: "var(--bg)" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Creating..." : "Create Task"}
          </button>
        </div>
      </form>
    </div>
  );
}
