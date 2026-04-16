import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
    BottomNavigation,
    BottomNavigationAction,
    Paper,
    Box,
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Badge,
    Avatar,
    Menu,
    MenuItem
} from '@mui/material';
import {
    Assignment as AssignmentIcon,
    BarChart as BarChartIcon,
    Description as DescriptionIcon,
    AssignmentInd as AssignmentIndIcon,
    ArrowBack as ArrowBackIcon,
    Logout as LogoutIcon,
    MoreVert as MoreVertIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useApprovalBadge } from '../contexts/ApprovalBadgeContext';

const MobileLayout = () => {
    const { user, logout } = useAuth();
    const { waitingCount } = useApprovalBadge();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    
    const [anchorEl, setAnchorEl] = useState(null);

    // Sync bottom navigation with current path
    const getActiveTab = () => {
        if (location.pathname.startsWith('/mobile/attendance')) return 3;
        const tab = searchParams.get('tab');
        if (tab) return parseInt(tab);
        return 0;
    };

    const handleTabChange = (event, newValue) => {
        if (newValue === 3) {
            navigate('/mobile/attendance');
        } else {
            // Force return to work logs if navigating to work-log related tabs
            if (location.pathname !== '/mobile/work-logs') {
                navigate(`/mobile/work-logs?tab=${newValue}`);
            } else {
                setSearchParams({ tab: newValue });
            }
        }
    };

    const handleLogout = () => {
        if (window.confirm("로그아웃 하시겠습니까?")) {
            logout();
            navigate('/login');
        }
    };

    // Hardware Back Button Handling
    useEffect(() => {
        // Push an initial state so the first back button doesn't exit the tab immediately
        window.history.pushState(null, null, window.location.pathname + window.location.search);

        const handlePopState = (event) => {
            // Check if we are at the mobile home screen (Work Log Tab 0 with no sub-views)
            const isAtHome = location.pathname === '/mobile/work-logs' && 
                             (searchParams.get('tab') === '0' || !searchParams.get('tab')) &&
                             !searchParams.get('planId') && 
                             !searchParams.get('itemId');
            
            if (isAtHome) {
                if (window.confirm("앱을 종료하시겠습니까?")) {
                    // Let the popstate proceed
                } else {
                    // Prevent exit
                    window.history.pushState(null, null, window.location.pathname + window.location.search);
                }
            } else {
                // If on Attendance or another tab, go to Home (Tab 0) first
                if (location.pathname === '/mobile/attendance' || searchParams.get('tab') !== '0') {
                    navigate('/mobile/work-logs?tab=0');
                } else {
                    // Otherwise, just handle sub-view back (e.g. from item to plan)
                    handleHeaderBack(); // Reuse header back logic
                }
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [location.pathname, searchParams, navigate]);

    // Header Back Button Logic
    const isSubView = location.search.includes('planId') || location.search.includes('itemId');
    const handleHeaderBack = () => {
        if (location.pathname.startsWith('/mobile/attendance')) {
            navigate('/mobile/work-logs');
        } else if (location.search.includes('itemId')) {
            const planId = searchParams.get('planId');
            setSearchParams({ tab: 0, planId });
        } else if (location.search.includes('planId')) {
            setSearchParams({ tab: 0 });
        } else {
            navigate(-1);
        }
    };

    return (
        <Box sx={{ position: 'relative', height: '100%', bgcolor: '#f8f9fa', overflow: 'hidden' }}>
            {/* Unified Mobile Header - Fixed at Top */}
            <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #eee', zIndex: 1100 }}>
                <Toolbar variant="dense" sx={{ justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {(isSubView || location.pathname.startsWith('/mobile/attendance')) && (
                            <IconButton edge="start" color="inherit" onClick={handleHeaderBack} sx={{ mr: 1 }}>
                                <ArrowBackIcon />
                            </IconButton>
                        )}
                        <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                            {location.pathname.startsWith('/mobile/attendance') ? '근태 관리' : '현장 작업관리'}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar 
                            sx={{ width: 30, height: 30, bgcolor: '#3b82f6', fontSize: '0.8rem', fontWeight: 'bold' }}
                            onClick={(e) => setAnchorEl(e.currentTarget)}
                        >
                            {user?.name?.charAt(0)}
                        </Avatar>
                        <Menu
                            anchorEl={anchorEl}
                            open={Boolean(anchorEl)}
                            onClose={() => setAnchorEl(null)}
                        >
                            <MenuItem onClick={handleLogout}>
                                <LogoutIcon fontSize="small" sx={{ mr: 1 }} /> 로그아웃
                            </MenuItem>
                        </Menu>
                    </Box>
                </Toolbar>
            </AppBar>

            {/* Content Area - Scrollable with padding for header/footer */}
            <Box sx={{ 
                position: 'absolute', 
                top: 48, // Dense Toolbar height
                bottom: 64, // Bottom Nav height
                left: 0, 
                right: 0, 
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch' // Smooth scroll on iOS
            }}>
                <Outlet />
            </Box>

            {/* Global Bottom Navigation - Fixed at Bottom */}
            <Paper sx={{ 
                position: 'fixed', 
                bottom: 0, 
                left: 0, 
                right: 0, 
                flexShrink: 0, 
                boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
                zIndex: 1100 
            }} elevation={3}>
                <BottomNavigation
                    showLabels
                    value={getActiveTab()}
                    onChange={handleTabChange}
                    sx={{ height: 64, pb: 2 }} // Added pb for safe areas
                >
                    <BottomNavigationAction label="생산현황" icon={<AssignmentIcon />} />
                    <BottomNavigationAction label="내 실적" icon={<BarChartIcon />} />
                    <BottomNavigationAction
                        label="전자결재"
                        icon={
                            <Badge
                                badgeContent={waitingCount}
                                color="error"
                                max={9}
                                sx={{ '& .MuiBadge-badge': { fontSize: '9px', height: 16, minWidth: 16 } }}
                            >
                                <DescriptionIcon />
                            </Badge>
                        }
                    />
                    <BottomNavigationAction label="근태현황" icon={<AssignmentIndIcon />} />
                </BottomNavigation>
            </Paper>
        </Box>
    );
};

export default MobileLayout;
