import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  InputAdornment,
  Typography,
  Box,
  Divider,
} from '@mui/material';
import { Search, UserPlus, UserMinus } from 'lucide-react';
import api from '../lib/api';

const ApprovalLineSelector = ({ open, onClose, onSelect, currentLines = [] }) => {
  const [staffList, setStaffList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLines, setSelectedLines] = useState({
    부장: null,
    공장장: null,
    이사: null,
    대표이사: null,
  });

  useEffect(() => {
    fetchStaff();
    // Initialize with current lines if they exist
    if ((currentLines || []).length > 0) {
      const initial = { 부장: null, 공장장: null, 이사: null, 대표이사: null };
      currentLines.forEach(line => {
          const role = line.role || '';
          if (role.includes('대표')) initial.대표이사 = line;
          else if (role.includes('이사') && !role.includes('대표')) initial.이사 = line;
          else if (role.includes('공장장')) initial.공장장 = line;
          else if (role.includes('부장')) initial.부장 = line;
      });
      setSelectedLines(initial);
    }
  }, [open, currentLines]);

  const fetchStaff = async () => {
    try {
      const res = await api.get('/basics/staff/');
      setStaffList(res.data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  // 결재 가능 직책 필터: 부장, 공장장, 이사, 대표이사 포함 직원만 표시
  const APPROVAL_ROLES = ['부장', '공장장', '이사', '대표이사'];
  const pertinentStaff = staffList.filter(s =>
    s.role && APPROVAL_ROLES.some(r => s.role.includes(r))
  );

  const filteredStaff = pertinentStaff.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectStaff = (staff, slot) => {
    // Role matching validation
    if (staff) {
        if (slot === '부장' && !(staff.role?.includes('부장') && !staff.role?.includes('이사') && !staff.role?.includes('대표') && !staff.role?.includes('공장장'))) {
            alert('부장 직급만 선택 가능합니다.'); return;
        }
        if (slot === '공장장' && !staff.role?.includes('공장장')) {
            alert('공장장 직급만 선택 가능합니다.'); return;
        }
        if (slot === '이사' && !(staff.role?.includes('이사') && !staff.role?.includes('대표'))) {
            alert('이사 직급만 선택 가능합니다.'); return;
        }
        if (slot === '대표이사' && !staff.role?.includes('대표')) {
            alert('대표이사 직급만 선택 가능합니다.'); return;
        }
    }
    
    setSelectedLines(prev => ({
      ...prev,
      [slot]: staff
    }));
  };

  const handleConfirm = () => {
    // Convert to the backend-friendly format: [{approver_id, sequence, role}]
    // 결재 순서: 부장(2) → 공장장(3) → 이사(4) → 대표이사(5)
    const lines = [];
    if (selectedLines.부장)    lines.push({ ...selectedLines.부장,    sequence: 2, role: '부장'    });
    if (selectedLines.공장장)  lines.push({ ...selectedLines.공장장,  sequence: 3, role: '공장장'  });
    if (selectedLines.이사)    lines.push({ ...selectedLines.이사,    sequence: 4, role: '이사'    });
    if (selectedLines.대표이사) lines.push({ ...selectedLines.대표이사, sequence: 5, role: '대표이사' });
    
    onSelect(lines);
    onClose();
  };

  // ── 슬롯 렌더 헬퍼 ──────────────────────────────────────────
  const SlotBox = ({ slot, label, step }) => (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="textSecondary">{label} ({step}단계)</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, border: '1px dashed #ccc', borderRadius: 1, minHeight: '40px', mt: 0.5 }}>
        {selectedLines[slot] ? (
          <>
            <Typography variant="body2">{selectedLines[slot].name}</Typography>
            <IconButton size="small" onClick={() => handleSelectStaff(null, slot)}><UserMinus size={16} /></IconButton>
          </>
        ) : <Typography variant="caption" color="disabled">미지정</Typography>}
      </Box>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 'bold' }}>결재선 지정</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 2, height: '450px' }}>
          {/* Left: Staff List */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="직원 검색 (이름, 직급)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ mb: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} />
                  </InputAdornment>
                ),
              }}
            />
            <List sx={{ flex: 1, overflowY: 'auto', border: '1px solid #eee' }}>
              {filteredStaff.map(staff => {
                const r = staff.role || '';
                const isBujang    = r.includes('부장') && !r.includes('이사') && !r.includes('대표') && !r.includes('공장장');
                const isGongjang  = r.includes('공장장');
                const isIsa       = r.includes('이사') && !r.includes('대표');
                const isDaepyo    = r.includes('대표');
                return (
                  <ListItem key={staff.id} divider>
                    <ListItemText
                      primary={staff.name}
                      secondary={r || '직급 없음'}
                    />
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Button
                          size="small" variant="outlined"
                          onClick={() => handleSelectStaff(staff, '부장')}
                          disabled={!isBujang}
                          sx={{ minWidth: '52px', fontSize: '12px' }}
                      >부장</Button>
                      <Button
                          size="small" variant="outlined" color="success"
                          onClick={() => handleSelectStaff(staff, '공장장')}
                          disabled={!isGongjang}
                          sx={{ minWidth: '56px', fontSize: '12px' }}
                      >공장장</Button>
                      <Button
                          size="small" variant="outlined"
                          onClick={() => handleSelectStaff(staff, '이사')}
                          disabled={!isIsa}
                          sx={{ minWidth: '52px', fontSize: '12px' }}
                      >이사</Button>
                      <Button
                          size="small" variant="outlined" color="primary"
                          onClick={() => handleSelectStaff(staff, '대표이사')}
                          disabled={!isDaepyo}
                          sx={{ minWidth: '52px', fontSize: '12px' }}
                      >대표</Button>
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          </Box>

          {/* Right: Selected Slots */}
          <Box sx={{ width: '260px', p: 2, bgcolor: '#f9f9f9', borderRadius: 1, border: '1px solid #ddd', overflowY: 'auto' }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: '#666' }}>지정된 결재선</Typography>
            <Divider sx={{ mb: 2 }} />
            <SlotBox slot="부장"    label="부장"    step={2} />
            <SlotBox slot="공장장"  label="공장장"  step={3} />
            <SlotBox slot="이사"    label="이사"    step={4} />
            <SlotBox slot="대표이사" label="대표이사" step={5} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit">취소</Button>
        <Button onClick={handleConfirm} variant="contained">확정</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ApprovalLineSelector;
