import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Grid, Typography, Box, Paper, RadioGroup, FormControlLabel, Radio,
    List, ListItem, ListItemText, CircularProgress, Divider
} from '@mui/material';
import api from '../lib/api';
import ProductModal from './ProductModal';

const ConsumableOrderModal = ({ open, onClose, onSuccess, waitItem }) => {
    const [partners, setPartners] = useState([]);
    const [selectedPartnerId, setSelectedPartnerId] = useState('');
    
    // mode: 'EXISTING' or 'NEW'
    const [mode, setMode] = useState('EXISTING');
    
    // Existing Mathcing States
    const [searchQuery, setSearchQuery] = useState('');
    const [matchedProducts, setMatchedProducts] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState(null);
    
    // New Product States
    const [newName, setNewName] = useState('');
    const [newSpec, setNewSpec] = useState('');
    const [newUnit, setNewUnit] = useState('EA');
    
    // Order info
    const [unitPrice, setUnitPrice] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);

    // New Product Modal State
    const [newProductModalOpen, setNewProductModalOpen] = useState(false);

    useEffect(() => {
        if (open) {
            fetchPartners();
            if (waitItem) {
                const initialName = waitItem.product?.name || waitItem.requested_item_name || '';
                setSearchQuery(initialName);
                setNewName(initialName);
                setNewSpec(waitItem.remarks || '');
                if (initialName) {
                    performSearch(initialName);
                }
            }
        } else {
            // Reset
            setMode('EXISTING');
            setSelectedProductId(null);
            setMatchedProducts([]);
            setUnitPrice('');
            setNote('');
            setSelectedPartnerId('');
        }
    }, [open, waitItem]);

    const fetchPartners = async () => {
        try {
            const res = await api.get('/basics/partners/', { params: { type: 'SUPPLIER' } });
            setPartners(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const performSearch = async (query) => {
        if (!query || query.length < 2) {
            setMatchedProducts([]);
            return;
        }
        setIsSearching(true);
        try {
            const res = await api.get(`/purchasing/purchase/consumables/match?name=${encodeURIComponent(query)}`);
            const results = res.data.filter(item => item.item_type === 'CONSUMABLE' || item.type === 'CONSUMABLE');
            setMatchedProducts(results);
            if (results.length > 0) {
                // Auto-select the first one 
                setSelectedProductId(results[0].id);
            } else {
                setSelectedProductId(null);
            }
        } catch (err) {
            console.error('Search failed', err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchQuery(val);
        // Quick debounce-like mechanism could be added here, currently directly fetching might be slightly inefficient if typing fast
        // We will just do a simple delay via frontend
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery) {
                performSearch(searchQuery);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSubmit = async () => {
        if (!selectedPartnerId) {
            alert("공급사를 먼저 선택해주세요.");
            return;
        }
        if (mode === 'EXISTING' && !selectedProductId) {
            alert("매칭할 기존 품목을 선택해주세요. 목록에 없다면 직접 신규 마스터 등록 후 발주를 선택하세요.");
            return;
        }
        if (mode === 'NEW' && !newName) {
            alert("신규 품목명을 입력해주세요.");
            return;
        }

        if (!window.confirm("이 품목으로 발주서를 생성하시겠습니까?")) return;

        setLoading(true);
        try {
            const payload = {
                wait_id: waitItem.id,
                partner_id: parseInt(selectedPartnerId, 10),
                unit_price: parseFloat(unitPrice) || 0,
                note: note
            };

            if (mode === 'EXISTING') {
                payload.product_id = selectedProductId;
            } else {
                payload.product_id = null;
                payload.new_product_name = newName;
                payload.new_product_spec = newSpec;
                payload.new_product_unit = newUnit;
            }

            const res = await api.post('/purchasing/purchase/consumables/order', payload);
            alert(`발주서(${res.data.order_no})가 성공적으로 발행되었습니다.`);
            onSuccess(res.data);
        } catch (err) {
            console.error(err);
            alert("발주 중 오류 발생: " + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleNewProductSuccess = (newProduct) => {
        setMatchedProducts(prev => [newProduct, ...prev]);
        setSelectedProductId(newProduct.id);
        setMode('EXISTING');
    };

    if (!waitItem) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ fontWeight: 'bold', color: '#1976d2', borderBottom: '1px solid #eee' }}>
                소모품 발주 매칭 및 생성
            </DialogTitle>
            <DialogContent sx={{ backgroundColor: '#f9fafb', py: 2 }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" color="primary" gutterBottom>원본 신청기안 정보</Typography>
                    <Paper sx={{ p: 2, backgroundColor: '#fff', border: '1px solid #e0e0e0' }} elevation={0}>
                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                <Typography variant="caption" color="textSecondary">요청 품목명 / 사유(용도)</Typography>
                                <Typography variant="body1" fontWeight="bold">
                                    {waitItem.requested_item_name || waitItem.product?.name || '-'}
                                    <span style={{ fontWeight: 'normal', color: '#666', fontSize: '0.85em', marginLeft: '6px' }}>
                                        / {waitItem.remarks || '없음'}
                                    </span>
                                </Typography>
                            </Grid>
                            <Grid item xs={3}>
                                <Typography variant="caption" color="textSecondary">신청 수량</Typography>
                                <Typography variant="body1" fontWeight="bold" color="secondary">{waitItem.quantity} {waitItem.product?.unit || 'EA'}</Typography>
                            </Grid>
                            <Grid item xs={3}>
                                <Typography variant="caption" color="textSecondary">기안자 및 부서 / 연결문서</Typography>
                                <Typography variant="body2" noWrap>
                                    <b>{waitItem.requester_name || waitItem.author_name || '-'}</b>
                                    {waitItem.department ? ` (${waitItem.department})` : ''} 
                                </Typography>
                                <Typography variant="caption" color="primary" noWrap>{waitItem.approval_title || '-'}</Typography>
                            </Grid>
                        </Grid>
                    </Paper>
                </Box>

                <Paper sx={{ p: 2, mb: 3, backgroundColor: '#fff', border: '1px solid #e0e0e0' }} elevation={0}>
                    <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>발주 품목 선택/등록 (재고 마스터 연동)</Typography>
                    
                    <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value)} sx={{ mb: 2 }}>
                        <FormControlLabel value="EXISTING" control={<Radio color="primary" size="small" />} label="기존 등록 품목에서 매칭 (권장)" />
                        <FormControlLabel value="NEW" control={<Radio color="primary" size="small" />} label="신규 품목 마스터로 등록 후 발주" />
                    </RadioGroup>

                    {mode === 'EXISTING' && (
                        <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                                <TextField
                                    fullWidth
                                    label="사내 마스터 품목명 검색 (입력 시 자동 검색)"
                                    variant="outlined"
                                    size="small"
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    sx={{ bgcolor: '#fff' }}
                                />
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={() => setNewProductModalOpen(true)}
                                    sx={{ whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                                >
                                    + 신규 등록
                                </Button>
                            </Box>
                            {isSearching ? <CircularProgress size={24} sx={{ display: 'block', m: 'auto' }} /> : (
                                <List sx={{ bgcolor: 'background.paper', border: '1px solid #ccc', borderRadius: 1, maxHeight: 180, overflow: 'auto' }} disablePadding>
                                    {matchedProducts.length > 0 ? matchedProducts.map((p) => (
                                        <ListItem 
                                            key={p.id} 
                                            button 
                                            selected={selectedProductId === p.id}
                                            onClick={() => setSelectedProductId(p.id)}
                                            sx={{ '&.Mui-selected': { bgcolor: '#e3f2fd' }, borderBottom: '1px solid #f0f0f0' }}
                                        >
                                            <ListItemText 
                                                primary={
                                                    <Typography fontWeight={selectedProductId === p.id ? "bold" : "normal"} color={selectedProductId === p.id ? "primary" : "textPrimary"}>
                                                        {p.name}
                                                    </Typography>
                                                } 
                                                secondary={`규격: ${p.specification || '없음'} | 단위: ${p.unit} | 구분: ${p.item_type} | 품번: ${p.code}`} 
                                            />
                                        </ListItem>
                                    )) : (
                                        <ListItem><ListItemText primary="검색된 유사 품목이 없습니다. 우측 상단의 [신규 품목 마스터로 등록]을 이용하세요." sx={{ color: '#d32f2f' }} /></ListItem>
                                    )}
                                </List>
                            )}
                        </Box>
                    )}

                    {mode === 'NEW' && (
                        <Box sx={{ p: 2, bgcolor: '#fff8e1', borderRadius: 1, border: '1px solid #ffe0b2' }}>
                            <Typography variant="body2" color="#e65100" sx={{ mb: 2 }}>
                                <b>안내:</b> 불필요한 마스터 데이터 중복 생성을 막기 위해 가급적 '기존 등록 품목' 탭에서 검색을 먼저 시도해주세요.
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField fullWidth label="신규 품목명 *" size="small" value={newName} onChange={(e) => setNewName(e.target.value)} />
                                </Grid>
                                <Grid item xs={3}>
                                    <TextField fullWidth label="규격 (옵션)" size="small" value={newSpec} onChange={(e) => setNewSpec(e.target.value)} />
                                </Grid>
                                <Grid item xs={3}>
                                    <TextField fullWidth label="단위" size="small" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </Paper>

                <Paper sx={{ p: 2, backgroundColor: '#fff', border: '1px solid #e0e0e0' }} elevation={0}>
                    <Typography variant="subtitle2" color="primary" sx={{ mb: 2 }}>발주 조건 밎 거래처</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>공급사 선택 *</Typography>
                            <select
                                value={selectedPartnerId}
                                onChange={(e) => setSelectedPartnerId(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box' }}
                            >
                                <option value="">공급사를 선택하세요</option>
                                {partners.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name} {p.manager_name ? `(${p.manager_name})` : ''}</option>
                                ))}
                            </select>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>구매 단가 (₩)</Typography>
                            <TextField
                                fullWidth
                                type="number"
                                size="small"
                                value={unitPrice}
                                onChange={(e) => setUnitPrice(e.target.value)}
                                placeholder="단가를 입력하세요"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="발주 관련 특이사항 및 비고 (선택)"
                                size="small"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </Grid>
                    </Grid>
                </Paper>
            </DialogContent>
            <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5', borderTop: '1px solid #ddd' }}>
                <Button onClick={onClose} disabled={loading} color="inherit">취소</Button>
                <Button onClick={handleSubmit} variant="contained" color="primary" disabled={loading} disableElevation>
                    {loading ? <CircularProgress size={24} color="inherit" /> : '최종 발주서 생성'}
                </Button>
            </DialogActions>
            <ProductModal
                isOpen={newProductModalOpen}
                onClose={() => setNewProductModalOpen(false)}
                onSuccess={handleNewProductSuccess}
                initialData={{ name: searchQuery }}
                type="CONSUMABLE"
            />
        </Dialog>
    );
};

export default ConsumableOrderModal;
