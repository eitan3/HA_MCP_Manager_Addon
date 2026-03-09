import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

interface Settings {
  log_level: 'debug' | 'info' | 'warning' | 'error';
  auto_start_servers: boolean;
}

const Settings: React.FC = () => {
  const queryClient = useQueryClient();
  const [settings, setSettings] = React.useState<Settings>({
    log_level: 'info',
    auto_start_servers: true,
  });
  const [saved, setSaved] = React.useState(false);

  const { data: currentSettings, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => api.get('/api/settings').then(res => res.data),
  });

  React.useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings]);

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Settings>) =>
      api.put('/api/settings', updates),
    onSuccess: (res) => {
      setSettings(res.data);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Settings
      </Typography>

      <Paper sx={{ p: 3 }}>
        <Box component="form" sx={{ mt: 2 }}>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Log Level</InputLabel>
            <Select
              value={settings.log_level}
              onChange={(e) => setSettings({ ...settings, log_level: e.target.value as Settings['log_level'] })}
              label="Log Level"
            >
              <MenuItem value="debug">Debug</MenuItem>
              <MenuItem value="info">Info</MenuItem>
              <MenuItem value="warning">Warning</MenuItem>
              <MenuItem value="error">Error</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Switch
                checked={settings.auto_start_servers}
                onChange={(e) => setSettings({ ...settings, auto_start_servers: e.target.checked })}
              />
            }
            label="Auto-start enabled servers on addon startup"
          />

          <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="contained"
              onClick={() => updateMutation.mutate(settings)}
              disabled={updateMutation.isPending}
            >
              Save Settings
            </Button>
            {saved && (
              <Typography color="success.main">Settings saved!</Typography>
            )}
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Connection Information
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Use the following URLs to connect your AI assistants to the MCP servers:
        </Typography>
        
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2">SSE Endpoints:</Typography>
          <Typography variant="body2" color="text.secondary">
            Each MCP server has its own SSE endpoint. Use the SSE URL shown in the Servers list.
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'grey.900', p: 1, borderRadius: 1, mt: 1 }}>
            http://homeassistant.local:14725/sse/[server-id]
          </Typography>
        </Box>
        
        <Box>
          <Typography variant="subtitle2">API Authentication:</Typography>
          <Typography variant="body2" color="text.secondary">
            Use either a Home Assistant long-lived access token or a custom API key created in the API Keys section.
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'grey.900', p: 1, borderRadius: 1, mt: 1 }}>
            Authorization: Bearer [your-token-or-api-key]
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
