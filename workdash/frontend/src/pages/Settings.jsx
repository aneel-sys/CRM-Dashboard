import { useState, useRef, useEffect } from 'react';
import { MdCloudUpload, MdDelete, MdSave, MdCheckCircle, MdError } from 'react-icons/md';
import api from '../api/axios';
import { useSettings } from '../context/SettingsContext';

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 24,
      marginBottom: 20,
    }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label style={{
      display: 'block',
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--text-secondary)',
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    }}>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, maxLength }) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        width: '100%',
        padding: '9px 12px',
        borderRadius: 8,
        fontSize: 14,
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        color: 'var(--text)',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s',
      }}
      onFocus={e => e.currentTarget.style.borderColor = '#1D9E75'}
      onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
    />
  );
}

export default function Settings() {
  const { appName, appSubtitle, logoUrl, reload } = useSettings();
  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    setName(appName);
    setSubtitle(appSubtitle);
  }, [appName, appSubtitle]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('File too large — max 2 MB', 'error');
      return;
    }
    setPreviewFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async () => {
    if (!previewFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('logo', previewFile);
      await api.post('/settings/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await reload();
      setPreview(null);
      setPreviewFile(null);
      if (fileRef.current) fileRef.current.value = '';
      showToast('Logo updated successfully');
    } catch (err) {
      showToast(err.response?.data?.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const cancelPreview = () => {
    setPreview(null);
    setPreviewFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeLogo = async () => {
    try {
      await api.delete('/settings/logo');
      await reload();
      showToast('Logo removed — using default icon');
    } catch {
      showToast('Failed to remove logo', 'error');
    }
  };

  const saveSettings = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.put('/settings', { appName: name.trim(), appSubtitle: subtitle.trim() });
      await reload();
      showToast('Settings saved successfully');
    } catch {
      showToast('Save failed — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  const displayLogo = preview || logoUrl;

  return (
    <div style={{ maxWidth: 620, position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 72,
          right: 24,
          zIndex: 200,
          background: toast.type === 'error' ? 'var(--danger)' : '#1D9E75',
          color: '#fff',
          borderRadius: 10,
          padding: '10px 18px',
          fontSize: 13,
          fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast.type === 'error' ? <MdError size={16} /> : <MdCheckCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Branding card */}
      <SectionCard
        title="Branding"
        subtitle="Customize the dashboard name and logo shown in the sidebar and login page."
      >
        {/* Logo section */}
        <div style={{ marginBottom: 28 }}>
          <FieldLabel>Logo</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>

            {/* Logo preview box */}
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: 14,
                border: '2px dashed var(--border)',
                background: 'var(--bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
                cursor: !preview ? 'pointer' : 'default',
              }}
              onClick={() => !preview && fileRef.current?.click()}
              title={!preview ? 'Click to upload logo' : undefined}
            >
              {displayLogo ? (
                <img
                  src={displayLogo}
                  alt="Logo preview"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 10 }}
                />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
                    <rect width="28" height="28" rx="7" fill="#1D9E75" />
                    <rect x="6" y="18" width="4" height="6" rx="1" fill="white" opacity="0.9" />
                    <rect x="12" y="13" width="4" height="11" rx="1" fill="white" />
                    <rect x="18" y="8" width="4" height="16" rx="1" fill="white" opacity="0.7" />
                  </svg>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Default</p>
                </div>
              )}
            </div>

            {/* Upload controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />

              {!preview ? (
                <>
                  <button
                    onClick={() => fileRef.current?.click()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text)', cursor: 'pointer',
                    }}
                  >
                    <MdCloudUpload size={16} style={{ color: '#1D9E75' }} />
                    Choose Logo
                  </button>
                  {logoUrl && (
                    <button
                      onClick={removeLogo}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--danger)', cursor: 'pointer',
                      }}
                    >
                      <MdDelete size={15} />
                      Remove Logo
                    </button>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={uploadLogo}
                    disabled={uploading}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: 'none', background: '#1D9E75', color: '#fff',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      opacity: uploading ? 0.65 : 1,
                    }}
                  >
                    <MdSave size={15} />
                    {uploading ? 'Uploading…' : 'Upload Logo'}
                  </button>
                  <button
                    onClick={cancelPreview}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                PNG, JPG, SVG or WebP · Max 2 MB
              </p>
            </div>
          </div>
        </div>

        {/* App Name */}
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Dashboard Name</FieldLabel>
          <TextInput
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="CRM Dashboard"
            maxLength={50}
          />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
            Shown in the sidebar, login page, and browser tab title
          </p>
        </div>

        {/* Subtitle */}
        <div style={{ marginBottom: 24 }}>
          <FieldLabel>Subtitle / Tagline</FieldLabel>
          <TextInput
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
            placeholder="Analytics Dashboard"
            maxLength={60}
          />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
            Shown below the name in the sidebar and login page
          </p>
        </div>

        <button
          onClick={saveSettings}
          disabled={saving || !name.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            border: 'none', background: '#1D9E75', color: '#fff',
            cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
            opacity: saving || !name.trim() ? 0.6 : 1,
            transition: 'opacity 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#0F6E56'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1D9E75'; }}
        >
          <MdSave size={16} />
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </SectionCard>

      {/* Admin credentials info card */}
      <SectionCard
        title="Admin Credentials"
        subtitle="Username and password are managed via server environment variables."
      >
        <div style={{
          background: 'var(--bg)',
          borderRadius: 8,
          padding: '12px 16px',
          fontFamily: 'monospace',
          fontSize: 13,
          marginBottom: 12,
          border: '1px solid var(--border)',
        }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
            {'ADMIN_USER='}<span style={{ color: '#1D9E75' }}>your_username</span>
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            {'ADMIN_PASS='}<span style={{ color: '#1D9E75' }}>your_password</span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          To change credentials: edit the <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>.env</code> file
          in Hostinger File Manager, then restart the Node.js app from the hosting panel.
        </p>
      </SectionCard>

    </div>
  );
}
