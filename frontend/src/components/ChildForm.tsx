import { useState } from 'react';
import { ArrowRight, Baby, Camera } from 'lucide-react';
import { Button } from '../components';
import { useApp } from '../context';
import { today, validBirthDate, type Child } from '../domain';
export function ChildForm({ initial, onSave, editing = false }: {
    initial?: Child | null;
    onSave: (child: Child) => Promise<void>;
    editing?: boolean;
}) { const { busy, toast } = useApp(); const [name, setName] = useState(initial?.name || ''); const [birth, setBirth] = useState(initial?.birthDate || ''); const [gender, setGender] = useState(initial?.gender || 'unspecified'); const [photo, setPhoto] = useState(initial?.photoUrl || ''); const [error, setError] = useState(''); return <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim() || !validBirthDate(birth)) {
    setError('이름과 올바른 생년월일을 입력해 주세요. 미래 날짜는 선택할 수 없어요.');
    return;
} await onSave({ id: initial?.id || crypto.randomUUID(), name: name.trim(), birthDate: birth, gender, photoUrl: photo || undefined }); }}><div className="photo-input"><div className="avatar large">{photo ? <img src={photo} alt="아이 프로필 미리보기"/> : <Baby size={52}/>}</div><label className="camera-upload" aria-label="아이 프로필 사진 선택"><Camera size={20}/><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; if (!file)
    return; if (file.size > 1500000) {
    toast('사진은 1.5MB 이하로 선택해 주세요.');
    return;
} if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    toast('JPG, PNG, WebP 사진을 선택해 주세요.');
    return;
} const reader = new FileReader(); reader.onload = () => setPhoto(String(reader.result)); reader.onerror = () => toast('사진을 읽을 수 없어요. 다시 선택해 주세요.'); reader.readAsDataURL(file); }}/></label></div><label className="field">아이 이름 <span className="required">*</span><input value={name} onChange={e => setName(e.target.value)} required maxLength={30} placeholder="아이의 이름을 알려주세요" autoComplete="off"/></label><label className="field">생년월일 <span className="required">*</span><input type="date" required min="2000-01-01" max={today()} value={birth} onChange={e => setBirth(e.target.value)}/></label><fieldset className="gender-field"><legend>성별 <small>선택 사항</small></legend><div>{[['female', '여아'], ['male', '남아']].map(([value, label]) => <label key={value} className={gender === value ? 'selected' : ''}><input type="radio" name="gender" value={value} checked={gender === value} onChange={() => setGender(value)}/>{label}</label>)}</div></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<Button variant="yellow" className="full" disabled={busy}>{busy ? '저장 중…' : editing ? '정보 저장' : '다음'}<ArrowRight size={17}/></Button></form>; }
