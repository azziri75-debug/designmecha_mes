import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Grid, Typography, Box, Paper, RadioGroup, FormControlLabel, Radio,
    List, ListItem, ListItemText, CircularProgress, Divider, Chip, Alert,
    Collapse, InputAdornment, IconButton
} from '@mui/material';
import { Search, CheckCircle, Plus, Store, Package } from 'lucide-react';
import api from '../lib/api';
import ProductModal from './ProductModal';

// 간단한 신규 파트너 등록 폼
const NewPartnerForm = ({ defaultName, onSuccess, onCancel }) => {
    const [name, setName] = useState(defaultName || '');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [manager, setManager] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) { alert('거래처명을 입력해주세요.'); return; }
        setSaving(true);
        try {
            const res = await api.post('/basics/partners/', {
                name: name.trim(),
                type: 'SUPPLIER',
                phone: phone || null,
                email: email || null,
                manager_name: manager || null,
            });
            alert(`거래처 '${res.data.name}'이(가) 등록되었습니다.`);
            onSuccess(res.data);
        } catch (err) {
            alert('등록 실패: ' + (err.response?.data?.detail || err.message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ p: 2, bgcolor: '#fff8e1', border: '1px solid #ffe0b2', borderRadius: 1 }}>
            <Typography variant="body2" color="#e65100" fontWeight="bold" sx={{ mb: 2 }}>
                신규 거래처(공급사) 등록
            </Typography>
            <Grid container spacing={2}>
                <Grid item xs={6}>
                    <TextField fullWidth label="거래처명 *" size="small" value={name} onChange={(e) => setName(e.target.value)} />
                </Grid>
                <Grid item xs={6}>
                    <TextField fullWidth label="담당자명" size="small" value={manager} onChange={(e) => setManager(e.target.value)} />
                </Grid>
                <Grid item xs={6}>
                    <TextField fullWidth label="전화번호" size="small" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Grid>
                <Grid item xs={6}>
                    <TextField fullWidth label="이메일" size="small" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Grid>
            </Grid>
            <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={onCancel} color="inherit">취소</Button>
                <Button size="small" variant="contained" color="warning" onClick={handleSave} disabled={saving}>
                    {saving ? '등록 중...' : '거래처 등록'}
                </Button>
            </Box>
        </Box>
    );
};

const ConsumableOrderModal = ({ open, onClose, onSuccess, waitItem }) => {
    const [partners, setPartners] = useState([]);
    const [selectedPartnerId, setSelectedPartnerId] = useState('');
    const [partnerSearchQuery, setPartnerSearchQuery] = useState('');
    const [showNewPartnerForm, setShowNewPartnerForm] = useState(false);

    // 품목 매칭 모드: 'EXISTING' | 'NEW'
    const [mode, setMode] = useState('EXISTING');

    // 품목 검색
    const [searchQuery, setSearchQuery] = useState('');
    const [matchedProducts, setMatchedProducts] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState(null);

    // 신규 품목 입력
    const [newName, setNewName] = useState('');
    const [newSpec, setNewSpec] = useState('');
    const [newUnit, setNewUnit] = useState('EA');

    // 발주 조건
    const [unitPrice, setUnitPrice] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);

    // 신규 품목 마스터 등록 모달
    const [newProductModalOpen, setNewProductModalOpen] = useState(false);

    // 자동매칭 상태 표시
    const [autoMatchedPartner, setAutoMatchedPartner] = useState(null);
    const [autoMatchedProduct, setAutoMatchedProduct] = useState(null);

    useEffect(() => {
        if (open) {
            fetchPartners();
            if (waitItem) {
                const initialName = waitItem.product?.name || waitItem.requested_item_name || '';
                const initialSpec = waitItem.requested_spec || waitItem.product?.specification || '';
                setSearchQuery(initialName);
                setNewName(initialName);
                setNewSpec(initialSpec);
                setNewUnit(waitItem.product?.unit || 'EA');
                setPartnerSearchQuery(waitItem.requested_partner_name || '');
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
            setPartnerSearchQuery('');
            setShowNewPartnerForm(false);
            setAutoMatchedPartner(null);
            setAutoMatchedProduct(null);
        }
    }, [open, waitItem]);

    // 파트너 로드 후 자동매칭
    useEffect(() => {
        if (partners.length > 0 && waitItem?.requested_partner_name) {
            autoMatchPartner(waitItem.requested_partner_name, partners);
        }
    }, [partners, waitItem]);

    const autoMatchPartner = (partnerName, partnerList) => {
        if (!partnerName) return;
        // 정확히 일치하는 파트너 먼저
        const exact = partnerList.find(p =>
            p.name.trim().toLowerCase() === partnerName.trim().toLowerCase()
        );
        if (exact) {
            setSelectedPartnerId(String(exact.id));
            setAutoMatchedPartner(exact);
            return;
        }
        // 포함 검색
        const partial = partnerList.find(p =>
            p.name.toLowerCase().includes(partnerName.toLowerCase()) ||
            partnerName.toLowerCase().includes(p.name.toLowerCase())
        );
        if (partial) {
            setSelectedPartnerId(String(partial.id));
            setAutoMatchedPartner(partial);
        }
    };

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
                setSelectedProductId(results[0].id);
                setAutoMatchedProduct(results[0]);
            } else {
                setSelectedProductId(null);
                setAutoMatchedProduct(null);
            }
        } catch (err) {
            console.error('Search failed', err);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery) performSearch(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const filteredPartners = partners.filter(p =>
        !partnerSearchQuery || p.name.toLowerCase().includes(partnerSearchQuery.toLowerCase())
    );

    const handleSubmit = async () => {
        if (!selectedPartnerId) {
            alert('공급사를 먼저 선택해주세요.');
            return;
        }
        if (mode === 'EXISTING' && !selectedProductId) {
            alert('매칭할 기존 품목을 선택해주세요. 목록에 없다면 [신규 품목 마스터 등록] 버튼을 이용하거나 신규 모드를 선택하세요.');
            return;
        }
        if (mode === 'NEW' && !newName) {
            alert('신규 품목명을 입력해주세요.');
            return;
        }
        if (!window.confirm('이 품목으로 발주서를 생성하시겠습니까?')) return;

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
            alert('발주 중 오류 발생: ' + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleNewProductSuccess = (newProduct) => {
        setMatchedProducts(prev => [newProduct, ...prev]);
        setSelectedProductId(newProduct.id);
        setAutoMatchedProduct(newProduct);
        setMode('EXISTING');
    };

    const handleNewPartnerSuccess = (newPartner) => {
        setPartners(prev => [newPartner, ...prev]);
        setSelectedPartnerId(String(newPartner.id));
        setAutoMatchedPartner(newPartner);
        setShowNewPartnerForm(false);
    };

    if (!waitItem) return null;

    const selectedPartnerObj = partners.find(p => String(p.id) === String(selectedPartnerId));

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ fontWeight: 'bold', color: '#1976d2', borderBottom: '1px solid #eee' }}>
                소모품 발주 매칭 및 생성
            </DialogTitle>
            <DialogContent sx={{ backgroundColor: '#f9fafb', py: 2 }}>

                {/* 원본 신청 정보 */}
                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="primary" gutterBottom>원본 신청기안 정보</Typography>
                    <Paper sx={{ p: 2, bgcolor: '#fff', border: '1px solid #e0e0e0' }} elevation={0}>
                        <Grid container spacing={2}>
                            <Grid item xs={4}>
                                <Typography variant="caption" color="textSecondary">요청 품목명</Typography>
                                <Typography variant="body1" fontWeight="bold">
                                    {waitItem.requested_item_name || waitItem.product?.name || '-'}
                                </Typography>
                            </Grid>
                            <Grid item xs={4}>
                                <Typography variant="caption" color="textSecondary">규격 / 제조사</Typography>
                                <Typography variant="body2">
                                    {waitItem.requested_spec || '-'}
                                    {waitItem.requested_manufacturer && (
                                        <span style={{ color: '#666', marginLeft: 6 }}>({waitItem.requested_manufacturer})</span>
                                    )}
                                </Typography>
                            </Grid>
                            <Grid item xs={2}>
                                <Typography variant="caption" color="textSecondary">신청 수량</Typography>
                                <Typography variant="body1" fontWeight="bold" color="secondary">
                                    {waitItem.quantity} {waitItem.product?.unit || 'EA'}
                                </Typography>
                            </Grid>
                            <Grid item xs={2}>
                                <Typography variant="caption" color="textSecondary">희망 거래처</Typography>
                                <Typography variant="body2" fontWeight="bold" color={waitItem.requested_partner_name ? 'primary' : 'textSecondary'}>
                                    {waitItem.requested_partner_name || '미기입'}
                                </Typography>
                            </Grid>
                        </Grid>
                        {(waitItem.remarks) && (
                            <Typography variant="body2" sx={{ mt: 1, color: '#666', fontSize: '0.8rem' }}>
                                📝 비고: {waitItem.remarks}
                            </Typography>
                        )}
                    </Paper>
                </Box>

                {/* 거래처(공급사) 선택 */}
                <Paper sx={{ p: 2, mb: 2, bgcolor: '#fff', border: '1px solid #e0e0e0' }} elevation={0}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="primary">
                            <Store size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            거래처(공급사) 선택 *
                        </Typography>
                        <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={() => setShowNewPartnerForm(v => !v)}
                            sx={{ fontSize: '0.75rem' }}
                        >
                            {showNewPartnerForm ? '취소' : '+ 신규 거래처 등록'}
                        </Button>
                    </Box>

                    {/* 자동 매칭 알림 */}
                    {autoMatchedPartner && selectedPartnerId && (
                        <Alert severity="success" icon={<CheckCircle size={16} />} sx={{ mb: 1, py: 0.5, fontSize: '0.8rem' }}>
                            기안서의 거래처명 "<b>{waitItem.requested_partner_name}</b>"으로 <b>{autoMatchedPartner.name}</b>이(가) 자동 선택되었습니다.
                        </Alert>
                    )}
                    {waitItem.requested_partner_name && !autoMatchedPartner && !showNewPartnerForm && (
                        <Alert severity="warning" sx={{ mb: 1, py: 0.5, fontSize: '0.8rem' }}>
                            기안의 거래처 "<b>{waitItem.requested_partner_name}</b>"이(가) 등록된 공급사 목록에 없습니다. 직접 선택하거나 신규 등록해주세요.
                        </Alert>
                    )}

                    <Collapse in={showNewPartnerForm}>
                        <Box sx={{ mb: 2 }}>
                            <NewPartnerForm
                                defaultName={waitItem.requested_partner_name || ''}
                                onSuccess={handleNewPartnerSuccess}
                                onCancel={() => setShowNewPartnerForm(false)}
                            />
                        </Box>
                    </Collapse>

                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <TextField
                            size="small"
                            placeholder="거래처명 검색..."
                            value={partnerSearchQuery}
                            onChange={(e) => setPartnerSearchQuery(e.target.value)}
                            sx={{ flex: 1, bgcolor: '#fff' }}
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>
                            }}
                        />
                        {selectedPartnerObj && (
                            <Chip
                                label={selectedPartnerObj.name}
                                color="primary"
                                size="small"
                                icon={<CheckCircle size={12} />}
                                sx={{ alignSelf: 'center' }}
                            />
                        )}
                    </Box>
                    <select
                        value={selectedPartnerId}
                        onChange={(e) => {
                            setSelectedPartnerId(e.target.value);
                            setAutoMatchedPartner(null);
                        }}
                        style={{
                            width: '100%', padding: '8px 12px', borderRadius: '4px',
                            border: selectedPartnerId ? '2px solid #1976d2' : '1px solid #ccc',
                            fontSize: '14px', boxSizing: 'border-box',
                            backgroundColor: selectedPartnerId ? '#e3f2fd' : '#fff'
                        }}
                    >
                        <option value="">공급사를 선택하세요</option>
                        {filteredPartners.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} {p.manager_name ? `(${p.manager_name})` : ''}
                            </option>
                        ))}
                    </select>
                </Paper>

                {/* 발주 품목 선택/등록 */}
                <Paper sx={{ p: 2, mb: 2, bgcolor: '#fff', border: '1px solid #e0e0e0' }} elevation={0}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="primary">
                            <Package size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            발주 품목 선택/등록 (재고 마스터 연동)
                        </Typography>
                    </Box>

                    {/* 자동 매칭 알림 */}
                    {autoMatchedProduct && mode === 'EXISTING' && (
                        <Alert severity="success" icon={<CheckCircle size={16} />} sx={{ mb: 1, py: 0.5, fontSize: '0.8rem' }}>
                            "<b>{waitItem.requested_item_name}</b>"으로 <b>{autoMatchedProduct.name}</b>이(가) 자동 검색 선택되었습니다.
                            {autoMatchedProduct.specification && <span> (규격: {autoMatchedProduct.specification})</span>}
                        </Alert>
                    )}

                    <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value)} sx={{ mb: 2 }}>
                        <FormControlLabel value="EXISTING" control={<Radio color="primary" size="small" />} label="기존 등록 품목에서 매칭 (권장)" />
                        <FormControlLabel value="NEW" control={<Radio color="primary" size="small" />} label="신규 품목 마스터 없이 바로 발주" />
                    </RadioGroup>

                    {mode === 'EXISTING' && (
                        <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                                <TextField
                                    fullWidth
                                    label="사내 마스터 품목명 검색"
                                    variant="outlined"
                                    size="small"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    sx={{ bgcolor: '#fff' }}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>
                                    }}
                                />
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={() => setNewProductModalOpen(true)}
                                    sx={{ whiteSpace: 'nowrap', minWidth: 'fit-content', fontSize: '0.75rem' }}
                                >
                                    + 마스터 신규등록
                                </Button>
                            </Box>
                            {/* 신청서 규격 힌트 */}
                            {waitItem.requested_spec && (
                                <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                                    💡 기안서 규격: <b>{waitItem.requested_spec}</b> — 아래 목록에서 일치하는 품목을 선택하세요.
                                </Typography>
                            )}
                            {isSearching ? (
                                <CircularProgress size={24} sx={{ display: 'block', m: 'auto' }} />
                            ) : (
                                <List
                                    sx={{ bgcolor: 'background.paper', border: '1px solid #ccc', borderRadius: 1, maxHeight: 200, overflow: 'auto' }}
                                    disablePadding
                                >
                                    {matchedProducts.length > 0 ? matchedProducts.map((p) => (
                                        <ListItem
                                            key={p.id}
                                            button
                                            selected={selectedProductId === p.id}
                                            onClick={() => { setSelectedProductId(p.id); setAutoMatchedProduct(p); }}
                                            sx={{ '&.Mui-selected': { bgcolor: '#e3f2fd' }, borderBottom: '1px solid #f0f0f0' }}
                                        >
                                            <ListItemText
                                                primary={
                                                    <Typography fontWeight={selectedProductId === p.id ? 'bold' : 'normal'} color={selectedProductId === p.id ? 'primary' : 'textPrimary'} fontSize="0.9rem">
                                                        {p.name}
                                                        {selectedProductId === p.id && <CheckCircle size={12} style={{ marginLeft: 6, color: '#1976d2', verticalAlign: 'middle' }} />}
                                                    </Typography>
                                                }
                                                secondary={`규격: ${p.specification || '없음'} | 단위: ${p.unit} | 품번: ${p.code || '-'}`}
                                            />
                                        </ListItem>
                                    )) : (
                                        <ListItem>
                                            <ListItemText
                                                primary="검색된 유사 품목이 없습니다."
                                                secondary="[마스터 신규등록] 버튼으로 품목을 등록하거나, 하단의 '신규 품목 마스터 없이 바로 발주' 모드를 선택하세요."
                                                sx={{ color: '#d32f2f' }}
                                            />
                                        </ListItem>
                                    )}
                                </List>
                            )}
                        </Box>
                    )}

                    {mode === 'NEW' && (
                        <Box sx={{ p: 2, bgcolor: '#fff8e1', borderRadius: 1, border: '1px solid #ffe0b2' }}>
                            <Typography variant="body2" color="#e65100" sx={{ mb: 2 }}>
                                <b>안내:</b> 품목 마스터 없이 신청서 텍스트 그대로 발주서를 생성합니다. 가급적 마스터 등록을 권장합니다.
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField fullWidth label="품목명 *" size="small" value={newName} onChange={(e) => setNewName(e.target.value)} />
                                </Grid>
                                <Grid item xs={4}>
                                    <TextField fullWidth label="규격" size="small" value={newSpec} onChange={(e) => setNewSpec(e.target.value)}
                                        placeholder={waitItem.requested_spec || ''}
                                        helperText={waitItem.requested_spec ? `기안서: ${waitItem.requested_spec}` : ''}
                                    />
                                </Grid>
                                <Grid item xs={2}>
                                    <TextField fullWidth label="단위" size="small" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </Paper>

                {/* 발주 단가 및 비고 */}
                <Paper sx={{ p: 2, bgcolor: '#fff', border: '1px solid #e0e0e0' }} elevation={0}>
                    <Typography variant="subtitle2" color="primary" sx={{ mb: 2 }}>발주 조건</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                type="number"
                                size="small"
                                label="구매 단가 (₩)"
                                value={unitPrice}
                                onChange={(e) => setUnitPrice(e.target.value)}
                                placeholder="단가를 입력하세요"
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="발주 비고 (선택)"
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
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    color="primary"
                    disabled={loading || !selectedPartnerId || (mode === 'EXISTING' && !selectedProductId)}
                    disableElevation
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : '최종 발주서 생성'}
                </Button>
            </DialogActions>

            {/* 신규 품목 마스터 등록 모달 */}
            <ProductModal
                isOpen={newProductModalOpen}
                onClose={() => setNewProductModalOpen(false)}
                onSuccess={handleNewProductSuccess}
                initialData={{ name: searchQuery, specification: waitItem?.requested_spec || '' }}
                type="CONSUMABLE"
            />
        </Dialog>
    );
};

export default ConsumableOrderModal;
