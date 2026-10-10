/** Server-rendered forms (Wait node "On Form Submitted", Form Trigger in phase 3B). No client JS needed. */

export interface FormField {
  fieldLabel: string;
  fieldType?: 'text' | 'textarea' | 'number' | 'email' | 'password' | 'date' | 'dropdown' | 'checkbox';
  requiredField?: boolean;
  placeholder?: string;
  fieldOptions?: { values?: Array<{ option: string }> };
}

export interface FormPage {
  title: string;
  description?: string;
  fields: FormField[];
  action: string;
  values?: Record<string, string>;
  errors?: Record<string, string>;
  buttonLabel?: string;
}

const escape = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fieldKey = (f: FormField, i: number) => `field-${i}`;

const STYLE = `
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;
background:#121216;color:#ececf1;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}
.card{width:100%;max-width:520px;background:#18181d;border:1px solid #2c2c36;border-radius:14px;padding:28px;box-shadow:0 20px 50px #0008}
h1{margin:0 0 6px;font-size:22px}.desc{color:#a0a0b0;margin:0 0 20px}label{display:block;font-weight:600;font-size:13px;margin:16px 0 6px}
.req{color:#f0524f}input,textarea,select{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #3b3b47;background:#1f1f26;color:#ececf1;font:inherit}
input:focus,textarea:focus,select:focus{outline:2px solid #f0592a;border-color:#f0592a}.err{color:#ff8a87;font-size:12.5px;margin-top:4px}
.check{display:flex;gap:8px;align-items:center;font-weight:500}.check input{width:auto}
button{margin-top:24px;width:100%;padding:12px;border:0;border-radius:8px;background:#f0592a;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
button:hover{background:#ff6d3a}.foot{margin-top:18px;text-align:center;color:#6e6e7e;font-size:12px}.done{text-align:center}.done .big{font-size:42px}
`;

function layout(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title><style>${STYLE}</style></head><body><main class="card">${inner}
<div class="foot">Powered by FlowForge</div></main></body></html>`;
}

export function renderForm(page: FormPage): string {
  const fields = page.fields
    .map((f, i) => {
      const key = fieldKey(f, i);
      const value = page.values?.[key] ?? '';
      const required = f.requiredField ? ' required' : '';
      const label = `<label for="${key}">${escape(f.fieldLabel)}${f.requiredField ? ' <span class="req">*</span>' : ''}</label>`;
      const error = page.errors?.[key] ? `<div class="err">${escape(page.errors[key])}</div>` : '';
      const placeholder = f.placeholder ? ` placeholder="${escape(f.placeholder)}"` : '';
      switch (f.fieldType) {
        case 'textarea':
          return `${label}<textarea id="${key}" name="${key}" rows="4"${placeholder}${required}>${escape(value)}</textarea>${error}`;
        case 'dropdown': {
          const options = (f.fieldOptions?.values ?? [])
            .map((o) => `<option${o.option === value ? ' selected' : ''}>${escape(o.option)}</option>`)
            .join('');
          return `${label}<select id="${key}" name="${key}"${required}><option value="">Choose…</option>${options}</select>${error}`;
        }
        case 'checkbox':
          return `<label class="check"><input type="checkbox" name="${key}" value="true"${value === 'true' ? ' checked' : ''}> ${escape(f.fieldLabel)}${f.requiredField ? ' <span class="req">*</span>' : ''}</label>${error}`;
        default: {
          const type = ['number', 'email', 'password', 'date'].includes(f.fieldType ?? '') ? f.fieldType : 'text';
          return `${label}<input id="${key}" name="${key}" type="${type}" value="${escape(value)}"${placeholder}${required}>${error}`;
        }
      }
    })
    .join('\n');
  return layout(
    page.title,
    `<h1>${escape(page.title)}</h1>${page.description ? `<p class="desc">${escape(page.description)}</p>` : ''}
<form method="post" action="${escape(page.action)}" novalidate>${fields}<button type="submit">${escape(page.buttonLabel ?? 'Submit')}</button></form>`,
  );
}

export function renderMessage(title: string, message: string, ok = true): string {
  return layout(title, `<div class="done"><div class="big">${ok ? '✅' : '⚠️'}</div><h1>${escape(title)}</h1><p class="desc">${escape(message)}</p></div>`);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Server-side validation. Returns the values keyed by field label, or errors keyed by field key. */
export function validateForm(fields: FormField[], body: Record<string, unknown>): { values: Record<string, unknown>; errors: Record<string, string>; raw: Record<string, string> } {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const raw: Record<string, string> = {};
  fields.forEach((f, i) => {
    const key = fieldKey(f, i);
    const input = body[key];
    const text = Array.isArray(input) ? String(input[0] ?? '') : String(input ?? '').trim();
    raw[key] = text;
    if (f.fieldType === 'checkbox') {
      if (f.requiredField && text !== 'true') errors[key] = 'This box must be checked';
      values[f.fieldLabel] = text === 'true';
      return;
    }
    if (!text) {
      if (f.requiredField) errors[key] = 'This field is required';
      values[f.fieldLabel] = f.fieldType === 'number' ? null : '';
      return;
    }
    if (text.length > 10_000) errors[key] = 'This answer is too long';
    else if (f.fieldType === 'email' && !EMAIL.test(text)) errors[key] = 'Enter a valid email address';
    else if (f.fieldType === 'number' && Number.isNaN(Number(text))) errors[key] = 'Enter a number';
    else if (f.fieldType === 'date' && Number.isNaN(Date.parse(text))) errors[key] = 'Enter a valid date';
    else if (f.fieldType === 'dropdown' && !(f.fieldOptions?.values ?? []).some((o) => o.option === text)) errors[key] = 'Choose one of the options';
    values[f.fieldLabel] = f.fieldType === 'number' ? Number(text) : text;
  });
  return { values, errors, raw };
}
