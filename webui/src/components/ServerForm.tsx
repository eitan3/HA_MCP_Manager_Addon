import React from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import api from '../api/client';

interface ServerData {
  name: string;
  enabled: boolean;
  install: {
    type: string;
    package: string;
    version: string;
  };
  transport: string;
  args: string[];
  env: Record<string, string>;
}

const ServerForm: React.FC = () => {
  const navigate = useNavigate();
  const { id: serverId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const isEdit = Boolean(serverId);

  const [formData, setFormData] = React.useState<ServerData>({
    name: '',
    enabled: true,
    install: {
      type: 'npm',
      package: '',
      version: 'latest',
    },
    transport: 'stdio',
    args: [],
    env: {},
  });

  const [argsText, setArgsText] = React.useState('');
  const [envText, setEnvText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Load server data for editing
  const { data: serverData } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => api.get(`/api/servers/${serverId}`).then(res => res.data),
    enabled: isEdit && !!serverId,
  });

  React.useEffect(() => {
    if (serverData) {
      setFormData(serverData);
      setArgsText((serverData.args || []).join('\n'));
      // Convert env object to KEY=VALUE format for editing
      const envLines = Object.entries(serverData.env || {})
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      setEnvText(envLines);
    }
  }, [serverData]);

  const createMutation = useMutation({
    mutationFn: (data: ServerData) => api.post('/api/servers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      navigate('/servers');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || err.message || 'Failed to create server');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<ServerData> }) =>
      api.put(`/api/servers/${data.id}`, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      navigate('/servers');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || err.message || 'Failed to update server');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Parse args from text
    const args = argsText.split('\n').map(line => line.trim()).filter(Boolean);

    // Parse env from text (KEY=VALUE format)
    const env: Record<string, string> = {};
    envText.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim();
          env[key] = value;
        }
      }
    });

    const submitData: ServerData = {
      ...formData,
      args,
      env,
    };

    if (isEdit && serverId) {
      updateMutation.mutate({ id: serverId, updates: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        {isEdit ? 'Edit Server' : 'Add New Server'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
        <TextField
          fullWidth
          label="Server Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          sx={{ mb: 2 }}
          placeholder="e.g., Home Assistant MCP"
        />

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" gutterBottom>Installation</Typography>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Install Type</InputLabel>
          <Select
            value={formData.install.type}
            onChange={(e) => setFormData({
              ...formData,
              install: { ...formData.install, type: e.target.value },
            })}
            label="Install Type"
          >
            <MenuItem value="npm">npm (Node.js via npx)</MenuItem>
            <MenuItem value="uvx">uvx (Python via uv)</MenuItem>
          </Select>
        </FormControl>

        <TextField
          fullWidth
          label="Package Name"
          value={formData.install.package}
          onChange={(e) => setFormData({
            ...formData,
            install: { ...formData.install, package: e.target.value },
          })}
          placeholder={formData.install.type === 'npm' 
            ? '@modelcontextprotocol/server-filesystem' 
            : 'mcp-server-home-assistant'}
          required
          sx={{ mb: 2 }}
          helperText={formData.install.type === 'npm' 
            ? 'npm package name (will be run with npx)' 
            : 'Python package name (will be run with uvx)'}
        />

        <TextField
          fullWidth
          label="Version"
          value={formData.install.version}
          onChange={(e) => setFormData({
            ...formData,
            install: { ...formData.install, version: e.target.value },
          })}
          placeholder="latest"
          sx={{ mb: 2 }}
          helperText="Package version or 'latest'"
        />

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" gutterBottom>Transport</Typography>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Transport Type</InputLabel>
          <Select
            value={formData.transport}
            onChange={(e) => setFormData({ ...formData, transport: e.target.value })}
            label="Transport Type"
          >
            <MenuItem value="stdio">stdio (recommended)</MenuItem>
            <MenuItem value="sse">SSE (Server-Sent Events)</MenuItem>
          </Select>
        </FormControl>

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" gutterBottom>Configuration</Typography>

        <TextField
          fullWidth
          label="Command Arguments"
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          multiline
          rows={4}
          sx={{ mb: 2 }}
          placeholder={"/path/to/allowed/directory\n--read-only"}
          helperText="One argument per line. These are passed to the MCP server command."
        />

        <TextField
          fullWidth
          label="Environment Variables"
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          multiline
          rows={4}
          sx={{ mb: 2 }}
          placeholder={"HOMEASSISTANT_URL=http://homeassistant.local:8123\nHOMEASSISTANT_TOKEN=your-token-here"}
          helperText="One per line in KEY=VALUE format. These environment variables will be passed to the MCP server."
        />

        <FormControlLabel
          control={
            <Switch
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
          }
          label="Auto-start when addon starts"
        />

        <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
          <Button 
            variant="contained" 
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {isEdit ? 'Update' : 'Create'}
          </Button>
          <Button variant="outlined" onClick={() => navigate('/servers')}>
            Cancel
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default ServerForm;
