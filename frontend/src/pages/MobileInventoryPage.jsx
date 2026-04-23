import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, CircularProgress, Chip, TextField, MenuItem, Select, FormControl,
    InputLabel, InputAdornment, IconButton, Drawer, Typography, Button,
    Divider, Fab
} from '@mui/material';
import {
    Search as SearchIcon,
    FilterList as FilterIcon,
    Close as CloseIcon,
    Inventory2 as InventoryIcon,
    Edit as EditIcon,
    Check as CheckIcon,
    Refresh as RefreshIcon,
} from '@mui/icons-material';
import api from '../lib/api';
import useSSE from '../hooks/useSSE';

const TYPE_MAP = {
    PRODUCED: '제품',
    PRODUCT: '제품',
    PART: '부품',
    RAW_MATERIAL: '원자재',
};

const TYPE_COLOR = {
    PRODUCED: '#3b82f6',
    PRODUCT: '#3b82f6',
    PART: '#f59e0b',
    RAW_MATERIAL: '#6b7280',
};

/* ──────────────────────────────────────────────────────────
   편집 드로어
────────────────────────────────────────────────────────── */
const EditDrawer = ({ open, stock, onClose, onSaved }) => {
    const [currentQty, setCurrentQty] = useState(0);
    const [inProdQty, setInProdQty] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && stock) {
            setCurrentQty(stock.current_quantity ?? 0);
            setInProdQty(stock.producing_total ?? 0);
        }
    }, [open, stock]);

    const handleSave = async () => {
        if (!stock) return;
        setLoading(true);
        try {
            await api.put(`/inventory/stocks/${stock.product_id}`, {
                current_quantity: Number(currentQty),
            });
            onSaved();
            onClose();
        } catch (e) {
            alert('수정 실패: ' + (e.response?.data?.detail || e.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer
            anchor="bottom"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    borderRadius: '20px 20px 0 0',
                    px: 3, pb: 4, pt: 2,
                    bgcolor: '#1e293b',
                    maxHeight: '80vh',
                }
            }}
        >
            {/* 핸들 */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
                <Box sx={{ width: 40, height: 4, bgcolor: '#475569', borderRadius: 2 }} />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography sx={{ fontWeight: 'bold', color: 'white', fontSize: '1.1rem' }}>
                    재고 수정
                </Typography>
                <IconButton onClick={onClose} sx={{ color: '#94a3b8' }}>
                    <CloseIcon />
                </IconButton>
            </Box>

            {stock && (
                <>
                    {/* 품목 정보 */}
                    <Box sx={{ bgcolor: '#0f172a', borderRadius: 2, p: 2, mb: 3 }}>
                        <Typography sx={{ fontWeight: 'bold', color: 'white', fontSize: '0.95rem' }}>
                            {stock.product?.name}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: '0.78rem', mt: 0.5 }}>
                            {stock.product?.code && `${stock.product.code} · `}{stock.product?.specification || '규격 없음'}
                        </Typography>
                    </Box>

                    <Divider sx={{ borderColor: '#334155', mb: 3 }} />

                    {/* 현재고 */}
                    <Box sx={{ mb: 3 }}>
                        <Typography sx={{ color: '#94a3b8', fontSize: '0.82rem', mb: 1, fontWeight: 500 }}>
                            현재고 수량 (수정 가능)
                        </Typography>
                        <TextField
                            fullWidth
                            type="number"
                            value={currentQty}
                            onChange={(e) => setCurrentQty(e.target.value)}
                            inputProps={{ min: 0 }}
                            sx={{
                                '& .MuiInputBase-root': { bgcolor: '#0f172a', borderRadius: 2, color: 'white' },
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                                '& input': { fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'right', p: 2 },
                            }}
                        />
                    </Box>

                    {/* 생산중 재고 (읽기전용) */}
                    <Box sx={{ mb: 4 }}>
                        <Typography sx={{ color: '#94a3b8', fontSize: '0.82rem', mb: 1, fontWeight: 500 }}>
                            생산중 재고 (자동 계산 — 읽기 전용)
                        </Typography>
                        <Box sx={{
                            bgcolor: '#0f172a', borderRadius: 2, p: 2,
                            border: '1px solid #1e3a5f',
                            display: 'flex', justifyContent: 'flex-end',
                        }}>
                            <Typography sx={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '1.5rem' }}>
                                {Number(inProdQty).toLocaleString()}
                            </Typography>
                        </Box>
                    </Box>

                    <Button
                        fullWidth
                        variant="contained"
                        disabled={loading}
                        onClick={handleSave}
                        startIcon={<CheckIcon />}
                        sx={{
                            bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' },
                            borderRadius: 2, py: 1.5, fontSize: '1rem', fontWeight: 'bold',
                        }}
                    >
                        {loading ? '저장 중...' : '수정 완료'}
                    </Button>
                </>
            )}
        </Drawer>
    );
};

/* ──────────────────────────────────────────────────────────
   재고 카드 (더블탭 → 수정)
────────────────────────────────────────────────────────── */
const StockCard = ({ stock, partners, onEdit }) => {
    const tapTimer = useRef(null);
    const tapCount = useRef(0);

    const handleTap = () => {
        tapCount.current += 1;
        if (tapCount.current === 1) {
            tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 300);
        } else if (tapCount.current >= 2) {
            clearTimeout(tapTimer.current);
            tapCount.current = 0;
            onEdit(stock);
        }
    };

    const itemType = stock.product?.item_type;
    const typeLabel = TYPE_MAP[itemType] || itemType || '-';
    const typeColor = TYPE_COLOR[itemType] || '#6b7280';
    const partnerName = partners.find(p => p.id === stock.product?.partner_id)?.name || '-';
    const currentQty = stock.current_quantity ?? 0;
    const producingQty = stock.producing_total ?? 0;

    return (
        <Box
            onClick={handleTap}
            sx={{
                bgcolor: '#1e293b',
                borderRadius: 2,
                p: 2,
                mb: 1.5,
                border: '1px solid #334155',
                cursor: 'pointer',
                '&:active': { opacity: 0.85 },
                transition: 'opacity 0.1s',
            }}
        >
            {/* 상단: 구분 칩 + 품목명 + 수정 아이콘 */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flex: 1, mr: 1 }}>
                    <Chip
                        label={typeLabel}
                        size="small"
                        sx={{
                            bgcolor: `${typeColor}22`,
                            color: typeColor,
                            border: `1px solid ${typeColor}55`,
                            fontWeight: 'bold',
                            fontSize: '0.68rem',
                            height: 20,
                        }}
                    />
                    <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.95rem', lineHeight: 1.3 }}>
                        {stock.product?.name || '-'}
                    </Typography>
                </Box>
                <EditIcon sx={{ color: '#475569', fontSize: 16, mt: 0.3, flexShrink: 0 }} />
            </Box>

            {/* 규격 */}
            <Typography sx={{ color: '#64748b', fontSize: '0.75rem', mb: 1.5, pl: 0.5 }}>
                {stock.product?.specification || '규격 없음'}
            </Typography>

            {/* 고객사 */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem', mr: 1 }}>고객사</Typography>
                <Typography sx={{ color: '#cbd5e1', fontSize: '0.78rem', fontWeight: 500 }}>
                    {partnerName}
                </Typography>
            </Box>

            {/* 재고 수치 */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Box sx={{ bgcolor: '#0f172a', borderRadius: 1.5, p: 1.5, textAlign: 'center' }}>
                    <Typography sx={{ color: '#64748b', fontSize: '0.7rem', mb: 0.5 }}>현재고</Typography>
                    <Typography sx={{
                        color: currentQty > 0 ? '#f1f5f9' : '#64748b',
                        fontWeight: 'bold',
                        fontSize: '1.2rem',
                    }}>
                        {currentQty.toLocaleString()}
                    </Typography>
                </Box>
                <Box sx={{
                    bgcolor: producingQty > 0 ? '#0c1a2e' : '#0f172a',
                    border: producingQty > 0 ? '1px solid #1e3a5f' : '1px solid transparent',
                    borderRadius: 1.5, p: 1.5, textAlign: 'center',
                }}>
                    <Typography sx={{ color: '#64748b', fontSize: '0.7rem', mb: 0.5 }}>생산중</Typography>
                    <Typography sx={{
                        color: producingQty > 0 ? '#38bdf8' : '#475569',
                        fontWeight: 'bold',
                        fontSize: '1.2rem',
                    }}>
                        {producingQty > 0 ? `+${producingQty.toLocaleString()}` : '-'}
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};

/* ──────────────────────────────────────────────────────────
   메인 페이지
────────────────────────────────────────────────────────── */
const MobileInventoryPage = () => {
    const [stocks, setStocks] = useState([]);
    const [partners, setPartners] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);

    // 필터
    const [searchTerm, setSearchTerm] = useState('');
    const [itemType, setItemType] = useState('');
    const [majorGroupId, setMajorGroupId] = useState('');
    const [hideEmpty, setHideEmpty] = useState(true);
    const [filterOpen, setFilterOpen] = useState(false);

    // 편집
    const [editingStock, setEditingStock] = useState(null);
    const [editOpen, setEditOpen] = useState(false);

    const fetchGroups = async () => {
        try {
            const res = await api.get('/product/groups/');
            setGroups(res.data || []);
        } catch (e) {
            console.error('fetch groups failed', e);
        }
    };

    const fetchPartners = async () => {
        try {
            const res = await api.get('/basics/partners/');
            setPartners(res.data || []);
        } catch (e) {
            console.error('fetch partners failed', e);
        }
    };

    const fetchStocks = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (searchTerm) params.product_name = searchTerm;
            if (itemType) params.item_type = itemType;
            if (majorGroupId) params.major_group_id = majorGroupId;

            const res = await api.get('/inventory/stocks', { params });
            // 중복 제거 (product_id 기준)
            const uniqueMap = new Map();
            (res.data || []).forEach(s => {
                if (s.product_id) uniqueMap.set(s.product_id, s);
            });
            let list = Array.from(uniqueMap.values());
            if (hideEmpty) {
                list = list.filter(s =>
                    Number(s.current_quantity || 0) > 0 || Number(s.producing_total || 0) > 0
                );
            }
            setStocks(list);
        } catch (e) {
            console.error('fetch stocks failed', e);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, itemType, majorGroupId, hideEmpty]);

    useEffect(() => {
        fetchGroups();
        fetchPartners();
    }, []);

    useEffect(() => {
        fetchStocks();
    }, [fetchStocks]);

    useSSE((eventType) => {
        if (eventType === 'inventory_updated' || eventType === 'production_updated') {
            fetchStocks();
        }
    });

    const handleEdit = (stock) => {
        setEditingStock(stock);
        setEditOpen(true);
    };

    const handleSaved = () => {
        fetchStocks();
    };

    // 활성 필터 수
    const activeFilterCount = [itemType, majorGroupId, hideEmpty ? 'hide' : ''].filter(Boolean).length;

    return (
        <Box sx={{ px: 2, pt: 2, pb: 2 }}>
            {/* 검색 + 필터 버튼 */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="품명 / 규격 검색..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: '#64748b', fontSize: 18 }} />
                            </InputAdornment>
                        ),
                        endAdornment: searchTerm ? (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => setSearchTerm('')}>
                                    <CloseIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                </IconButton>
                            </InputAdornment>
                        ) : null,
                        sx: {
                            bgcolor: '#1e293b',
                            borderRadius: 2,
                            color: 'white',
                            '& fieldset': { borderColor: '#334155' },
                            '& input': { color: 'white', fontSize: '0.9rem' },
                        }
                    }}
                />
                <IconButton
                    onClick={() => setFilterOpen(true)}
                    sx={{
                        bgcolor: activeFilterCount > 0 ? '#2563eb' : '#1e293b',
                        border: '1px solid',
                        borderColor: activeFilterCount > 0 ? '#2563eb' : '#334155',
                        borderRadius: 2,
                        px: 1.5,
                        position: 'relative',
                    }}
                >
                    <FilterIcon sx={{ color: activeFilterCount > 0 ? 'white' : '#94a3b8' }} />
                    {activeFilterCount > 0 && (
                        <Box sx={{
                            position: 'absolute', top: 4, right: 4,
                            width: 8, height: 8, bgcolor: '#f43f5e', borderRadius: '50%',
                        }} />
                    )}
                </IconButton>
                <IconButton
                    onClick={fetchStocks}
                    sx={{ bgcolor: '#1e293b', border: '1px solid #334155', borderRadius: 2 }}
                >
                    <RefreshIcon sx={{ color: '#94a3b8' }} />
                </IconButton>
            </Box>

            {/* 활성 필터 칩 표시 */}
            {activeFilterCount > 0 && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                    {hideEmpty && (
                        <Chip
                            label="재고있는 품목만"
                            size="small"
                            onDelete={() => setHideEmpty(false)}
                            sx={{ bgcolor: '#1e293b', color: '#34d399', border: '1px solid #34d39955' }}
                        />
                    )}
                    {itemType && (
                        <Chip
                            label={TYPE_MAP[itemType] || itemType}
                            size="small"
                            onDelete={() => setItemType('')}
                            sx={{ bgcolor: '#1e293b', color: '#f59e0b', border: '1px solid #f59e0b55' }}
                        />
                    )}
                    {majorGroupId && (
                        <Chip
                            label={groups.find(g => g.id.toString() === majorGroupId)?.name || '사업부'}
                            size="small"
                            onDelete={() => setMajorGroupId('')}
                            sx={{ bgcolor: '#1e293b', color: '#a78bfa', border: '1px solid #a78bfa55' }}
                        />
                    )}
                </Box>
            )}

            {/* 결과 카운트 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <InventoryIcon sx={{ color: '#64748b', fontSize: 16 }} />
                <Typography sx={{ color: '#64748b', fontSize: '0.8rem' }}>
                    {loading ? '로딩 중...' : `총 ${stocks.length}건`}
                </Typography>
                <Typography sx={{ color: '#475569', fontSize: '0.75rem', ml: 'auto' }}>
                    더블탭으로 수정
                </Typography>
            </Box>

            {/* 리스트 */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress size={32} sx={{ color: '#3b82f6' }} />
                </Box>
            ) : stocks.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <InventoryIcon sx={{ fontSize: 48, color: '#334155', mb: 1 }} />
                    <Typography sx={{ color: '#475569' }}>재고 데이터가 없습니다</Typography>
                </Box>
            ) : (
                stocks.map(stock => (
                    <StockCard
                        key={stock.product_id}
                        stock={stock}
                        partners={partners}
                        onEdit={handleEdit}
                    />
                ))
            )}

            {/* 필터 드로어 */}
            <Drawer
                anchor="bottom"
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                PaperProps={{
                    sx: {
                        borderRadius: '20px 20px 0 0',
                        px: 3, pb: 4, pt: 2,
                        bgcolor: '#1e293b',
                    }
                }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
                    <Box sx={{ width: 40, height: 4, bgcolor: '#475569', borderRadius: 2 }} />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography sx={{ fontWeight: 'bold', color: 'white', fontSize: '1.05rem' }}>
                        필터
                    </Typography>
                    <Button
                        size="small"
                        onClick={() => { setItemType(''); setMajorGroupId(''); setHideEmpty(true); }}
                        sx={{ color: '#64748b', fontSize: '0.8rem' }}
                    >
                        초기화
                    </Button>
                </Box>

                {/* 재고없는 품목 숨기기 토글 */}
                <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    bgcolor: '#0f172a', borderRadius: 2, px: 2, py: 1.5, mb: 3,
                    border: '1px solid', borderColor: hideEmpty ? '#34d39955' : '#334155',
                    cursor: 'pointer',
                }}
                    onClick={() => setHideEmpty(v => !v)}
                >
                    <Box>
                        <Typography sx={{ color: 'white', fontSize: '0.9rem', fontWeight: 500 }}>재고없는 품목 숨기기</Typography>
                        <Typography sx={{ color: '#64748b', fontSize: '0.75rem', mt: 0.3 }}>현재고와 생산중이 모두 0인 품목을 숨깁니다</Typography>
                    </Box>
                    <Box sx={{
                        width: 44, height: 24, borderRadius: 12,
                        bgcolor: hideEmpty ? '#22c55e' : '#334155',
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0, ml: 2,
                    }}>
                        <Box sx={{
                            position: 'absolute', top: 2,
                            left: hideEmpty ? 22 : 2,
                            width: 20, height: 20, borderRadius: '50%',
                            bgcolor: 'white', transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                    </Box>
                </Box>

                {/* 사업부 */}
                <Typography sx={{ color: '#94a3b8', fontSize: '0.8rem', mb: 1 }}>사업부</Typography>
                <FormControl fullWidth size="small" sx={{ mb: 3 }}>
                    <Select
                        value={majorGroupId}
                        onChange={e => setMajorGroupId(e.target.value)}
                        displayEmpty
                        sx={{
                            bgcolor: '#0f172a',
                            color: 'white',
                            borderRadius: 2,
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                            '& .MuiSvgIcon-root': { color: '#64748b' },
                        }}
                    >
                        <MenuItem value="">전체 사업부</MenuItem>
                        {groups.filter(g => g.type === 'MAJOR').map(g => (
                            <MenuItem key={g.id} value={g.id.toString()}>{g.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {/* 구분 (제품/부품) */}
                <Typography sx={{ color: '#94a3b8', fontSize: '0.8rem', mb: 1 }}>제품 / 부품 구분</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 4 }}>
                    {[
                        { value: '', label: '전체' },
                        { value: 'PRODUCED', label: '제품' },
                        { value: 'PART', label: '부품' },
                        { value: 'RAW_MATERIAL', label: '원자재' },
                    ].map(opt => (
                        <Chip
                            key={opt.value}
                            label={opt.label}
                            onClick={() => setItemType(opt.value)}
                            sx={{
                                bgcolor: itemType === opt.value ? '#2563eb' : '#0f172a',
                                color: itemType === opt.value ? 'white' : '#94a3b8',
                                border: '1px solid',
                                borderColor: itemType === opt.value ? '#2563eb' : '#334155',
                                cursor: 'pointer',
                                '&:hover': { opacity: 0.85 },
                            }}
                        />
                    ))}
                </Box>

                <Button
                    fullWidth
                    variant="contained"
                    onClick={() => setFilterOpen(false)}
                    sx={{
                        bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' },
                        borderRadius: 2, py: 1.5, fontWeight: 'bold',
                    }}
                >
                    적용
                </Button>
            </Drawer>

            {/* 편집 드로어 */}
            <EditDrawer
                open={editOpen}
                stock={editingStock}
                onClose={() => setEditOpen(false)}
                onSaved={handleSaved}
            />
        </Box>
    );
};

export default MobileInventoryPage;
