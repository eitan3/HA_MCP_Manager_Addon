import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box, AppBar, Toolbar, Typography, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Container } from '@mui/material';
import { Dns as ServerIcon, VpnKey as KeyIcon, Settings as SettingsIcon, Dashboard as InfoIcon } from '@mui/icons-material';
import Dashboard from './components/Dashboard';
import ServerList from './components/ServerList';
import ServerForm from './components/ServerForm';
import ApiKeyManager from './components/ApiKeyManager';
import Settings from './components/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const drawerWidth = 240;

interface MenuItem {
  text: string;
  icon: React.ReactNode;
  path: string;
}

const menuItems: MenuItem[] = [
  { text: 'Dashboard', icon: <InfoIcon />, path: '/' },
  { text: 'Servers', icon: <ServerIcon />, path: '/servers' },
  { text: 'API Keys', icon: <KeyIcon />, path: '/keys' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

// Navigation component that uses React Router's Link
const Navigation: React.FC = () => {
  const location = useLocation();
  
  return (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap>
          MCP Manager
        </Typography>
      </Toolbar>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton 
              component={Link} 
              to={item.path}
              selected={location.pathname === item.path}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

// Get the base path for the router
// When running in HA ingress, the URL includes an ingress prefix
function getBasename(): string {
  const path = window.location.pathname;
  
  // Check if we're in HA ingress
  // The URL pattern is /api/hassio_ingress/<token>/
  const ingressMatch = path.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  if (ingressMatch) {
    return ingressMatch[1];
  }
  
  return '';
}

const App: React.FC = () => {
  const basename = getBasename();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <Box sx={{ display: 'flex' }}>
          <AppBar
            position="fixed"
            sx={{
              width: { sm: `calc(100% - ${drawerWidth}px)` },
              ml: { sm: `${drawerWidth}px` },
            }}
          >
            <Toolbar>
              <Typography variant="h6" noWrap component="div">
                MCP Manager for Home Assistant
              </Typography>
            </Toolbar>
          </AppBar>
          <Box
            component="nav"
            sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
          >
            <Drawer
              variant="permanent"
              sx={{
                display: { xs: 'none', sm: 'block' },
                '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
              }}
              open
            >
              <Navigation />
            </Drawer>
          </Box>
          <Box
            component="main"
            sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${drawerWidth}px)` } }}
          >
            <Toolbar />
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/servers" element={<ServerList />} />
                <Route path="/servers/new" element={<ServerForm />} />
                <Route path="/servers/:id/edit" element={<ServerForm />} />
                <Route path="/keys" element={<ApiKeyManager />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Container>
          </Box>
        </Box>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
