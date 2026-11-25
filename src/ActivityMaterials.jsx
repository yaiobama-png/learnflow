import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

function ActivityMaterials({ activityId, userId }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');

  const [title, setTitle] = useState('');
  const [type, setType] = useState('website');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadMaterials();
  }, [activityId]);

  async function loadMaterials() {
    setLoading(true);

    const { data, error } = await supabase
      .from('activity_materials')
      .select('*')
      .eq('activity_id', activityId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage('Could not load materials: ' + error.message);
    } else {
      setMaterials(data || []);
    }

    setLoading(false);
  }

  async function addMaterial(e) {
    e.preventDefault();

    if (!title.trim()) {
      setMessage('Please enter a title.');
      return;
    }

    if (type !== 'note' && !url.trim()) {
      setMessage('Please enter a link.');
      return;
    }

    if (url.trim()) {
      try {
        const parsedUrl = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Invalid protocol');
        }
      } catch {
        setMessage('Please enter a valid website link starting with https://');
        return;
      }
    }

    setSaving(true);
    setMessage('');

    const { data, error } = await supabase
      .from('activity_materials')
      .insert({
        activity_id: activityId,
        user_id: userId,
        title: title.trim(),
        material_type: type,
        url: type === 'note' ? null : url.trim(),
        notes: notes.trim() || null,
      })
      .select()
      .single();

    if (error) {
      setMessage('Could not save material: ' + error.message);
    } else {
      setMaterials((previous) => [data, ...previous]);
      setTitle('');
      setType('website');
      setUrl('');
      setNotes('');
      setShowForm(false);
      setMessage('Material added successfully!');
    }

    setSaving(false);
  }

  async function deleteMaterial(id) {
    const confirmed = window.confirm('Delete this learning material?');
    if (!confirmed) return;

    const { error } = await supabase
      .from('activity_materials')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      setMessage('Could not delete material: ' + error.message);
      return;
    }

    setMaterials((previous) => previous.filter((item) => item.id !== id));
    setMessage('Material deleted successfully!');
  }

  return (
    <div className="activity-materials">
      <div className="materials-heading">
        <div>
          <strong>📚 Learning Materials</strong>
          <small>Save useful links and study notes.</small>
        </div>

        <button
          type="button"
          className="materials-add-button"
          onClick={() => {
            setShowForm(!showForm);
            setMessage('');
          }}
        >
          {showForm ? 'Cancel' : '+ Add material'}
        </button>
      </div>

      {message && <p className="materials-message">{message}</p>}

      {showForm && (
        <form className="materials-form" onSubmit={addMaterial}>
          <label>Material title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. SQL Joins Tutorial"
            maxLength={150}
            required
          />

          <label>Material type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="website">Website / Article</option>
            <option value="youtube">YouTube video</option>
            <option value="note">Study note</option>
          </select>

          {type !== 'note' && (
            <>
              <label>Website link</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                required
              />
            </>
          )}

          <label>
            {type === 'note'
              ? 'Your study note'
              : 'Additional notes (optional)'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Write something useful to remember..."
            rows={3}
          />

          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Saving...' : 'Save material'}
          </button>
        </form>
      )}

      {loading ? (
        <p>Loading materials...</p>
      ) : materials.length === 0 ? (
        <p className="materials-empty">No learning materials added yet.</p>
      ) : (
        <div className="materials-list">
          {materials.map((material) => (
            <div className="material-item" key={material.id}>
              <div className="material-icon">
                {material.material_type === 'youtube'
                  ? '▶️'
                  : material.material_type === 'note'
                  ? '📝'
                  : '🔗'}
              </div>

              <div className="material-content">
                <strong>{material.title}</strong>

                {material.url && (
                  <a
                    href={material.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open material ↗
                  </a>
                )}

                {material.notes && <p>{material.notes}</p>}
              </div>

              <button
                type="button"
                className="delete-button"
                onClick={() => deleteMaterial(material.id)}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ActivityMaterials;
