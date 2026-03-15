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
    이사: null,
    대표이사: null,
  });

  useEffect(() => {
    fetchStaff();
    // Initialize with current lines if they exist
    if ((currentLines || []).length > 0) {
      const initial = { 부장: null, 이사: null, 대표이사: null };
      currentLines.forEach(line => {
          if (line.role === '부장') initial.부장 = line;
          if (line.role === '이사') initial.이사 = line;
          if (line.role === '대표이사' || line.role === '대표') initial.대표이사 = line;
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

  const filteredStaff = staffList.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectStaff = (staff, slot) => {
    setSelectedLines(prev => ({
      ...prev,
      [slot]: staff
    }));
  };

  const handleConfirm = () => {
    // Convert to the backend-friendly format: [{approver_id, sequence, role}]
    const lines = [];
    if (selectedLines.부장) lines.push({ ...selectedLines.부장, sequence: 2, role: '부장' });
    if (selectedLines.이사) lines.push({ ...selectedLines.이사, sequence: 3, role: '이사' });
    if (selectedLines.대표이사) lines.push({ ...selectedLines.대표이사, sequence: 4, role: '대표이사' });
    
    onSelect(lines);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 'bold' }}>결재선 지정</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 2, height: '400px' }}>
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
              {filteredStaff.map(staff => (
                <ListItem key={staff.id} divider>
                  <ListItemText 
                    primary={staff.name} 
                    secondary={staff.role || '직급 없음'} 
                  />
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined" onClick={() => handleSelectStaff(staff, '부장')}>부장</Button>
                    <Button size="small" variant="outlined" onClick={() => handleSelectStaff(staff, '이사')}>이사</Button>
                    <Button size="small" variant="outlined" color="primary" onClick={() => handleSelectStaff(staff, '대표이사')}>대표</Button>
                  </Box>
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Right: Selected Slots */}
          <Box sx={{ width: '250px', p: 2, bgcolor: '#f9f9f9', borderRadius: 1, border: '1px solid #ddd' }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: '#666' }}>지정된 결재선</Typography>
            <Divider sx={{ mb: 2 }} />
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="textSecondary">부장 (2단계)</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, border: '1px dashed #ccc', borderRadius: 1, minHeight: '40px', mt: 0.5 }}>
                {selectedLines.부장 ? (
                  <>
                    <Typography variant="body2">{selectedLines.부장.name}</Typography>
                    <IconButton size="small" onClick={() => handleSelectStaff(null, '부장')}><UserMinus size={16} /></IconButton>
                  </>
                ) : <Typography variant="caption" color="disabled">미지정</Typography>}
              </Box>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="textSecondary">이사 (3단계)</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, border: '1px dashed #ccc', borderRadius: 1, minHeight: '40px', mt: 0.5 }}>
                {selectedLines.이사 ? (
                  <>
                    <Typography variant="body2">{selectedLines.이사.name}</Typography>
                    <IconButton size="small" onClick={() => handleSelectStaff(null, '이사')}><UserMinus size={16} /></IconButton>
                  </>
                ) : <Typography variant="caption" color="disabled">미지정</Typography>}
              </Box>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="textSecondary">대표이사 (4단계)</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, border: '1px dashed #ccc', borderRadius: 1, minHeight: '40px', mt: 0.5 }}>
                {selectedLines.대표이사 ? (
                  <>
                    <Typography variant="body2">{selectedLines.대표이사.name}</Typography>
                    <IconButton size="small" onClick={() => handleSelectStaff(null, '대표이사')}><UserMinus size={16} /></IconButton>
                  </>
                ) : <Typography variant="caption" color="disabled">미지정</Typography>}
              </Box>
            </Box>
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
