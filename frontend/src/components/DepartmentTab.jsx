import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { Plus, Edit2, Trash2, Users, ChevronDown, ChevronUp, CheckSquare, Square, Shield, X, Save, LayoutOrg, Printer, Phone, Mail, Building2 } from 'lucide-react';

const DOC_TYPES = [
  { value: 'LEAVE_REQUEST', label: '휴가원' },
  { value: 'EARLY_LEAVE', label: '조퇴/외출원' },
  { value: 'OVERTIME', label: '야근/특근' },
  { value: 'INTERNAL_DRAFT', label: '내부기안' },
  { value: 'EXPENSE_REPORT', label: '지출결의서' },
  { value: 'CONSUMABLES_PURCHASE', label: '소모품 신청' },
  { value: 'PURCHASE_ORDER', label: '구매발주서' },
];

const cn = (...c) => c.filter(Boolean).join(' ');

// 직급 순위 (낮은 숫자 = 높은 직급)
const RANK = {
  '대표이사': 1, '사장': 2, '부사장': 3, '전무': 4, '상무': 5, '이사': 6,
  '실장': 7, '부장': 8, '차장': 9, '과장': 10, '팀장': 11, '계장': 12,
  '주임': 13, '선임': 14, '사원': 17, '연구원': 18,
};
const getRank = (role) => {
  if (!role) return 99;
  for (const [k, v] of Object.entries(RANK)) if (role.includes(k)) return v;
  return 50;
};

/* ──────────────────────────────────────────
   조직도 인쇄용 CSS (print 미디어 쿼리)
   ────────────────────────────────────────── */
const PRINT_STYLE = `
@media print {
  /* ── 조직도 전용 인쇄 스타일 (body.org-chart-printing 클래스일 때만 적용) ── */

  /* 1. body 전체를 숨기되 레이아웃은 유지 (visibility 방식 → 스크롤바 미캡처) */
  body.org-chart-printing {
    visibility: hidden !important;
    overflow: visible !important;
    height: auto !important;
  }

  /* 2. 조직도 영역만 보이게 */
  body.org-chart-printing #org-chart-print-area {
    visibility: visible !important;
    position: absolute !important;
    top: 0 !important; left: 0 !important;
    width: 100% !important;
    overflow: visible !important;
    background: white !important;
    padding: 10mm 12mm !important;
    box-sizing: border-box !important;
  }
  body.org-chart-printing #org-chart-print-area * {
    visibility: visible !important;
  }

  /* 3. 조직도 내 인쇄 불필요 요소 숨김 */
  body.org-chart-printing .no-print {
    visibility: hidden !important;
    display: none !important;
  }

  /* 4. 스크롤바 완전 제거 */
  body.org-chart-printing ::-webkit-scrollbar { display: none !important; }

  /* 5. 카드가 페이지 경계에서 잘리지 않도록 */
  body.org-chart-printing .org-card {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  /* 6. 인쇄 시 경영진 카드 강조색 제거 → 흑백 통일 */
  body.org-chart-printing #org-chart-print-area [class*="from-blue"],
  body.org-chart-printing #org-chart-print-area [class*="from-purple"],
  body.org-chart-printing #org-chart-print-area [class*="to-purple"],
  body.org-chart-printing #org-chart-print-area [class*="border-blue"] {
    background: white !important;
    background-image: none !important;
    border-color: #d1d5db !important;
  }
  body.org-chart-printing #org-chart-print-area [class*="bg-blue"],
  body.org-chart-printing #org-chart-print-area [class*="bg-purple"] {
    background: #e5e7eb !important;
    background-image: none !important;
  }
  body.org-chart-printing #org-chart-print-area [class*="text-blue"],
  body.org-chart-printing #org-chart-print-area [class*="text-purple"],
  body.org-chart-printing #org-chart-print-area [class*="text-white"] {
    color: #111827 !important;
  }
  body.org-chart-printing #org-chart-print-area [class*="text-gray-4"],
  body.org-chart-printing #org-chart-print-area [class*="text-gray-5"] {
    color: #6b7280 !important;
  }
}
`;

/* ──────────────────────────────────────────
   직원 카드 컴포넌트
   ────────────────────────────────────────── */
function StaffCard({ member, highlight }) {
  return (
    <div className={cn(
      'rounded-xl border p-4 flex flex-col gap-1 shadow-sm transition-all',
      highlight
        ? 'bg-gradient-to-br from-blue-900/60 to-purple-900/40 border-blue-500/50 shadow-blue-900/30'
        : 'bg-gray-800/80 border-gray-700/60 hover:border-gray-600',
      'print:bg-white print:border-gray-300 print:shadow-none print:rounded-lg'
    )}>
      <div className="flex items-center gap-2 mb-1">
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
          highlight ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300',
          'print:bg-gray-200 print:text-gray-800'
        )}>
          {member.name?.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-white text-sm leading-tight print:text-gray-900">{member.name}</div>
          {member.role && (
            <div className={cn(
              'text-xs font-medium',
              highlight ? 'text-blue-300' : 'text-gray-400',
              'print:text-gray-600'
            )}>{member.role}</div>
          )}
        </div>
      </div>
      <div className="space-y-0.5 text-xs text-gray-400 print:text-gray-600">
        {member.phone && (
          <div className="flex items-center gap-1.5 truncate">
            <Phone className="w-3 h-3 flex-shrink-0 text-gray-500" />
            <span>{member.phone}</span>
          </div>
        )}
        {member.extension && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 flex-shrink-0 text-center text-[10px] text-gray-500 font-mono">내선</span>
            <span className="font-mono">{member.extension}</span>
          </div>
        )}
        {member.email && (
          <div className="flex items-center gap-1.5 truncate">
            <Mail className="w-3 h-3 flex-shrink-0 text-gray-500" />
            <span className="truncate">{member.email}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   조직도 모달
   ────────────────────────────────────────── */
function OrgChartModal({ onClose, departments, allStaff, company }) {
  const printRef = useRef(null);

  const handlePrint = () => {
    // 스타일 주입 (중복 방지)
    if (!document.getElementById('__org_print_style__')) {
      const style = document.createElement('style');
      style.id = '__org_print_style__';
      style.textContent = PRINT_STYLE;
      document.head.appendChild(style);
    }
    // body에 클래스 추가 → 조직도 전용 print CSS 활성화
    document.body.classList.add('org-chart-printing');
    // afterprint 이벤트에서 클래스 제거 (다른 문서 인쇄에 영향 없도록)
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('org-chart-printing');
    }, { once: true });
    window.print();
  };

  // 직급 최상위 직원 (대표이사 등) - 부서 미배정 or 최상위 직급
  const topStaff = allStaff
    .filter(s => s.is_active && getRank(s.role) <= 3)
    .sort((a, b) => getRank(a.role) - getRank(b.role));

  // 부서별 직원 (allStaff로 enrich해서 phone/extension/email 포함)
  const deptSections = departments.map(dept => ({
    ...dept,
    sortedMembers: [...(dept.members || [])]
      .map(m => allStaff.find(s => s.id === m.id) || m) // ← 전체 데이터로 보완
      .filter(m => m.is_active !== false)
      .sort((a, b) => getRank(a.role) - getRank(b.role)),
  }));

  // 무소속 활성 직원 (부서 없고 최상위 직급도 아닌)
  const assignedIds = new Set(departments.flatMap(d => (d.members || []).map(m => m.id)));
  const unassigned = allStaff
    .filter(s => s.is_active && !assignedIds.has(s.id) && getRank(s.role) > 3)
    .sort((a, b) => getRank(a.role) - getRank(b.role));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950/95 backdrop-blur-sm">
      {/* 상단 툴바 */}
      <div className="no-print flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">조직도</h2>
          {company?.name && <span className="text-sm text-gray-400">— {company.name}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Printer className="w-4 h-4" /> 인쇄 / PDF 저장
          </button>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 조직도 본문 */}
      <div className="flex-1 overflow-auto p-8 bg-gray-950">
        <div id="org-chart-print-area" ref={printRef} className="max-w-6xl mx-auto space-y-10 print:space-y-8">

          {/* 회사 타이틀 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white print:text-gray-900">
              {company?.name || '회사'} 조직도
            </h1>
            <p className="text-gray-400 text-sm mt-1 print:text-gray-600">
              {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 기준
            </p>
          </div>

          {/* 최상위 직급 (대표이사 등) */}
          {topStaff.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gradient-to-r from-blue-500/50 to-transparent" />
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest print:text-blue-600">경영진</span>
                <div className="h-px flex-1 bg-gradient-to-l from-blue-500/50 to-transparent" />
              </div>
              <div className="flex flex-wrap justify-center gap-4">
                {topStaff.map(m => (
                  <div key={m.id} className="w-52">
                    <StaffCard member={m} highlight />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 부서별 섹션 */}
          {deptSections.map(dept => dept.sortedMembers.length > 0 && (
            <section key={dept.id}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gradient-to-r from-gray-600 to-transparent" />
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 print:bg-gray-100 rounded-full border border-gray-700 print:border-gray-300">
                  <Users className="w-3.5 h-3.5 text-gray-400 print:text-gray-600" />
                  <span className="text-sm font-semibold text-gray-200 print:text-gray-800">{dept.name}</span>
                  <span className="text-xs text-gray-500 print:text-gray-400">{dept.sortedMembers.length}명</span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-l from-gray-600 to-transparent" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 print:grid-cols-4">
                {dept.sortedMembers.map(m => (
                  <StaffCard key={m.id} member={m} />
                ))}
              </div>
            </section>
          ))}

          {/* 무소속 직원 */}
          {unassigned.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gradient-to-r from-gray-700 to-transparent" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">기타</span>
                <div className="h-px flex-1 bg-gradient-to-l from-gray-700 to-transparent" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 print:grid-cols-4">
                {unassigned.map(m => (
                  <StaffCard key={m.id} member={m} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   메인 DepartmentTab
   ────────────────────────────────────────── */
export default function DepartmentTab() {
  const [departments, setDepartments] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [company, setCompany] = useState(null);
  const [allLines, setAllLines] = useState({});
  const [loading, setLoading] = useState(true);

  const [editDept, setEditDept] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberModalDept, setMemberModalDept] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');

  const [editingApprovalLine, setEditingApprovalLine] = useState(null);
  const [approvalLineStaff, setApprovalLineStaff] = useState([]);

  const [showOrgChart, setShowOrgChart] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [deptsRes, staffRes, companyRes] = await Promise.all([
        api.get('/basics/departments/'),
        api.get('/basics/staff/'),
        api.get('/basics/company'),
      ]);
      setDepartments(deptsRes.data);
      setAllStaff(staffRes.data.filter(s => s.is_active));
      setCompany(companyRes.data);
    } catch (e) {
      console.error('Failed to fetch', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchApprovalLines = async (deptId) => {
    const result = {};
    await Promise.all(DOC_TYPES.map(async (dt) => {
      try {
        const res = await api.get(`/approval/lines?doc_type=${dt.value}&department_id=${deptId}`);
        result[dt.value] = res.data;
      } catch { result[dt.value] = []; }
    }));
    setAllLines(prev => ({ ...prev, [deptId]: result }));
  };

  const handleExpand = async (deptId) => {
    if (expanded === deptId) { setExpanded(null); return; }
    setExpanded(deptId);
    if (!allLines[deptId]) await fetchApprovalLines(deptId);
  };

  const handleCreate = async () => {
    if (!newDeptName.trim()) return alert('부서명을 입력하세요.');
    try {
      await api.post('/basics/departments/', { name: newDeptName.trim(), description: newDeptDesc.trim(), member_ids: [] });
      setShowCreateModal(false); setNewDeptName(''); setNewDeptDesc('');
      fetchAll();
    } catch (e) { alert('생성 실패: ' + (e.response?.data?.detail || e.message)); }
  };

  const handleDelete = async (deptId, deptName) => {
    if (!window.confirm(`'${deptName}' 부서를 삭제하시겠습니까?`)) return;
    try { await api.delete(`/basics/departments/${deptId}`); fetchAll(); }
    catch (e) { alert('삭제 실패: ' + (e.response?.data?.detail || e.message)); }
  };

  const handleSaveDeptInfo = async (dept) => {
    try {
      await api.put(`/basics/departments/${dept.id}`, {
        name: editDept.name, description: editDept.description,
        member_ids: dept.members.map(m => m.id),
      });
      setEditDept(null); fetchAll();
    } catch (e) { alert('저장 실패: ' + (e.response?.data?.detail || e.message)); }
  };

  const openMemberModal = (dept) => {
    setMemberModalDept(dept);
    setSelectedMemberIds(dept.members.map(m => m.id));
    setMemberSearch('');
    setShowMemberModal(true);
  };

  const handleSaveMembers = async () => {
    try {
      await api.put(`/basics/departments/${memberModalDept.id}`, {
        name: memberModalDept.name, description: memberModalDept.description,
        member_ids: selectedMemberIds,
      });
      setShowMemberModal(false); fetchAll();
    } catch (e) { alert('저장 실패: ' + (e.response?.data?.detail || e.message)); }
  };

  const startEditApprovalLine = async (deptId, docType) => {
    const lines = allLines[deptId]?.[docType] || [];
    setApprovalLineStaff(lines.map(l => ({ approver_id: l.approver_id, sequence: l.sequence, name: l.approver?.name || '', role: l.approver?.role || '' })));
    setEditingApprovalLine({ deptId, docType });
  };

  const addApprovalLineRow = () => {
    const nextSeq = (approvalLineStaff.length > 0 ? Math.max(...approvalLineStaff.map(a => a.sequence)) : 0) + 1;
    setApprovalLineStaff(prev => [...prev, { approver_id: '', sequence: nextSeq, name: '', role: '' }]);
  };

  const handleApprovalLineChange = (idx, field, value) => {
    setApprovalLineStaff(prev => prev.map((a, i) => {
      if (i !== idx) return a;
      if (field === 'approver_id') {
        const s = allStaff.find(s => s.id === parseInt(value));
        return { ...a, approver_id: parseInt(value), name: s?.name || '', role: s?.role || '' };
      }
      return { ...a, [field]: value };
    }));
  };

  const saveApprovalLine = async () => {
    const { deptId, docType } = editingApprovalLine;
    const lines = approvalLineStaff.filter(a => a.approver_id).map(a => ({
      doc_type: docType, approver_id: a.approver_id, sequence: a.sequence, department_id: deptId,
    }));
    try {
      await api.post(`/approval/lines?doc_type=${docType}&department_id=${deptId}`, lines);
      setEditingApprovalLine(null);
      await fetchApprovalLines(deptId);
    } catch (e) { alert('저장 실패: ' + (e.response?.data?.detail || e.message)); }
  };

  const filteredStaff = allStaff.filter(s =>
    !memberSearch || s.name.includes(memberSearch) || (s.department || '').includes(memberSearch)
  );

  if (loading) return <div className="p-8 text-center text-gray-400">불러오는 중...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">조직도</h2>
          <p className="text-sm text-gray-400 mt-1">부서를 관리하고 부서별 결재선을 설정합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOrgChart(true)}
            className="flex items-center gap-2 bg-emerald-600/80 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-emerald-500/30"
          >
            <Building2 className="w-4 h-4" /> 조직도 열람
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> 부서 추가
          </button>
        </div>
      </div>

      {/* 부서 목록 */}
      {departments.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>등록된 부서가 없습니다. 부서를 추가해 주세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {departments.map(dept => (
            <div key={dept.id} className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-blue-400" />
                  </div>
                  {editDept?.id === dept.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input value={editDept.name} onChange={e => setEditDept(p => ({ ...p, name: e.target.value }))}
                        className="bg-gray-900 border border-gray-600 text-white rounded px-3 py-1.5 text-sm w-40 focus:ring-1 focus:ring-blue-500" />
                      <input value={editDept.description || ''} onChange={e => setEditDept(p => ({ ...p, description: e.target.value }))}
                        placeholder="설명 (선택)" className="bg-gray-900 border border-gray-600 text-gray-300 rounded px-3 py-1.5 text-sm flex-1 focus:ring-1 focus:ring-blue-500" />
                      <button onClick={() => handleSaveDeptInfo(dept)} className="text-green-400 hover:text-green-300 p-1.5 bg-green-500/10 rounded"><Save className="w-4 h-4" /></button>
                      <button onClick={() => setEditDept(null)} className="text-gray-400 hover:text-gray-300 p-1.5"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold truncate">{dept.name}</h3>
                      {dept.description && <p className="text-xs text-gray-400 truncate">{dept.description}</p>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <span className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">{dept.members?.length || 0}명</span>
                  <button onClick={() => openMemberModal(dept)} title="직원 추가/제거" className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"><Users className="w-4 h-4" /></button>
                  <button onClick={() => setEditDept({ id: dept.id, name: dept.name, description: dept.description })} title="부서 정보 수정" className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(dept.id, dept.name)} title="부서 삭제" className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                  <button onClick={() => handleExpand(dept.id)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
                    {expanded === dept.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {dept.members?.length > 0 && (
                <div className="px-5 pb-3 flex flex-wrap gap-2">
                  {dept.members.map(m => (
                    <span key={m.id} className="px-2 py-0.5 bg-gray-700/60 border border-gray-600 rounded text-xs text-gray-300">
                      {m.name} {m.role && <span className="text-gray-500">({m.role})</span>}
                    </span>
                  ))}
                </div>
              )}

              {expanded === dept.id && (
                <div className="border-t border-gray-700 px-5 py-4 space-y-4 bg-gray-900/40">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-purple-400" />
                    <h4 className="text-sm font-semibold text-white">결재선 설정</h4>
                    <span className="text-xs text-gray-500">- 미설정 시 공통 결재선이 적용됩니다.</span>
                  </div>
                  {DOC_TYPES.map(dt => {
                    const lines = allLines[dept.id]?.[dt.value] || [];
                    const isEditing = editingApprovalLine?.deptId === dept.id && editingApprovalLine?.docType === dt.value;
                    return (
                      <div key={dt.value} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-200">{dt.label}</span>
                          {!isEditing && (
                            <button onClick={() => startEditApprovalLine(dept.id, dt.value)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                              <Edit2 className="w-3 h-3" /> 수정
                            </button>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="space-y-2">
                            {approvalLineStaff.map((line, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 w-6">{line.sequence}</span>
                                <select value={line.approver_id || ''} onChange={e => handleApprovalLineChange(idx, 'approver_id', e.target.value)}
                                  className="bg-gray-900 border border-gray-600 text-white text-xs rounded px-2 py-1 flex-1 focus:ring-1 focus:ring-blue-500">
                                  <option value="">결재자 선택</option>
                                  {allStaff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role || '직급없음'})</option>)}
                                </select>
                                <button onClick={() => setApprovalLineStaff(p => p.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 p-1"><X className="w-3 h-3" /></button>
                              </div>
                            ))}
                            <div className="flex items-center gap-2 pt-1">
                              <button onClick={addApprovalLineRow} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus className="w-3 h-3" /> 결재자 추가</button>
                              <div className="flex-1" />
                              <button onClick={() => setEditingApprovalLine(null)} className="text-xs text-gray-400 hover:text-gray-300 px-2 py-1">취소</button>
                              <button onClick={saveApprovalLine} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded">저장</button>
                            </div>
                          </div>
                        ) : lines.length === 0 ? (
                          <p className="text-xs text-gray-500 italic">공통 결재선 사용 (별도 설정 없음)</p>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            {lines.sort((a, b) => a.sequence - b.sequence).map((line, i) => (
                              <React.Fragment key={line.id}>
                                {i > 0 && <span className="text-gray-600">→</span>}
                                <span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-xs text-purple-300">
                                  {line.approver?.name} <span className="text-purple-400/60">({line.approver?.role || '-'})</span>
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 조직도 모달 */}
      {showOrgChart && (
        <OrgChartModal
          onClose={() => setShowOrgChart(false)}
          departments={departments}
          allStaff={allStaff}
          company={company}
        />
      )}

      {/* 부서 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">새 부서 추가</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">부서명 *</label>
                <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)} placeholder="예: 생산팀"
                  className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" autoFocus />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">설명 (선택)</label>
                <input value={newDeptDesc} onChange={e => setNewDeptDesc(e.target.value)} placeholder="부서 설명"
                  className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">취소</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">생성</button>
            </div>
          </div>
        </div>
      )}

      {/* 직원 다중 선택 모달 */}
      {showMemberModal && memberModalDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">소속 직원 설정 <span className="text-blue-400">— {memberModalDept.name}</span></h3>
              <button onClick={() => setShowMemberModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="이름 또는 부서로 검색..."
              className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            <div className="flex items-center justify-between text-xs text-gray-400 mb-2 px-1">
              <span>직원 목록 ({filteredStaff.length}명)</span>
              <div className="flex gap-3">
                <button onClick={() => setSelectedMemberIds(filteredStaff.map(s => s.id))} className="text-blue-400 hover:text-blue-300">전체 선택</button>
                <button onClick={() => setSelectedMemberIds([])} className="text-gray-400 hover:text-gray-300">전체 해제</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {filteredStaff.map(s => {
                const checked = selectedMemberIds.includes(s.id);
                return (
                  <div key={s.id} onClick={() => setSelectedMemberIds(prev => checked ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                    className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                      checked ? 'bg-blue-500/20 border border-blue-500/30' : 'hover:bg-gray-700/50 border border-transparent')}>
                    {checked ? <CheckSquare className="w-4 h-4 text-blue-400 flex-shrink-0" /> : <Square className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white">{s.name}</span>
                      {s.role && <span className="text-xs text-gray-400 ml-2">({s.role})</span>}
                    </div>
                    {s.department && <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">{s.department}</span>}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-gray-700 mt-3">
              <span className="text-xs text-gray-400">{selectedMemberIds.length}명 선택됨</span>
              <div className="flex gap-2">
                <button onClick={() => setShowMemberModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">취소</button>
                <button onClick={handleSaveMembers} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
