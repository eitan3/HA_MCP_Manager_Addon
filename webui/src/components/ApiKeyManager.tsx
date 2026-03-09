import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { Delete, ContentCopy, Add } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

interface APIKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
  serverIds: string[];
}

interface Server {
  id: string;
  name: string;
}

const ApiKeyManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [newKeyName, setNewKeyName] = React.useState('');
  const [newServerIds, setNewServerIds] = React.useState<string[]>([]);
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);

  const { data: keys, isLoading } = useQuery<APIKey[]>({
    queryKey: ['apiKeys'],
    queryFn: () => api.get('/api/keys').then(res => res.data),
  });

  const { data: servers } = useQuery<Server[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/api/servers').then(res => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; serverIds: string[] }) =>
      api.post('/api/keys', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      setCreatedKey(res.data.key);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/keys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apiKeys'] }),
  });

  const handleCreate = () => {
    if (newKeyName) {
      createMutation.mutate({ name: newKeyName, serverIds: newServerIds });
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setNewKeyName('');
    setNewServerIds([]);
    setCreatedKey(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleServerToggle = (serverId: string, checked: boolean) => {
    if (checked) {
      setNewServerIds([...newServerIds, serverId]);
    } else {
      setNewServerIds(newServerIds.filter(id => id !== serverId));
    }
  };

  if (isLoading) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">API Keys</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
          Create API Key
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Key</TableCell>
              <TableCell>Servers</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Last Used</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {keys?.map((key) => (
              <TableRow key={key.id}>
                <TableCell>{key.name}</TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {key.key.substring(0, 12)}...
                    </Typography>
                    <IconButton size="small" onClick={() => copyToClipboard(key.key)}>
                      <ContentCopy fontSize="small" />
                    </IconButton>
                  </Box>
                </TableCell>
                <TableCell>
                  <Box display="flex" gap={0.5} flexWrap="wrap">
                    {key.serverIds.map((sid) => {
                      const server = servers?.find(s => s.id === sid);
                      return (
                        <Chip key={sid} label={server?.name || sid} size="small" />
                      );
                    })}
                  </Box>
                </TableCell>
                <TableCell>
                  {new Date(key.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {key.lastUsed ? new Date(key.lastUsed).toLocaleString() : 'Never'}
                </TableCell>
                <TableCell>
                  <IconButton
                    color="error"
                    onClick={() => {
                      if (confirm('Delete this API key?')) {
                        deleteMutation.mutate(key.id);
                      }
                    }}
                  >
                    <Delete />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {keys?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="text.secondary" sx={{ py: 4 }}>
                    No API keys created. Click "Create API Key" to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent>
          {createdKey ? (
            <Box sx={{ pt: 2 }}>
              <Typography gutterBottom>
                API Key created! Copy it now - it won't be shown again:
              </Typography>
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'grey.900',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  color: 'success.main',
                }}
              >
                {createdKey}
              </Box>
              <Button
                sx={{ mt: 2 }}
                onClick={() => copyToClipboard(createdKey)}
                startIcon={<ContentCopy />}
                variant="outlined"
              >
                Copy to Clipboard
              </Button>
            </Box>
          ) : (
            <Box sx={{ pt: 2 }}>
              <TextField
                fullWidth
                label="Key Name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Claude Desktop"
                sx={{ mb: 2 }}
              />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Server Access
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                Select which MCP servers this API key can access
              </Typography>
              {servers?.map((server) => (
                <FormControlLabel
                  key={server.id}
                  control={
                    <Checkbox
                      checked={newServerIds.includes(server.id)}
                      onChange={(e) => handleServerToggle(server.id, e.target.checked)}
                    />
                  }
                  label={server.name}
                />
              ))}
              {servers?.length === 0 && (
                <Typography color="text.secondary">
                  No servers configured. Create servers first.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>
            {createdKey ? 'Close' : 'Cancel'}
          </Button>
          {!createdKey && (
            <Button onClick={handleCreate} variant="contained" disabled={!newKeyName}>
              Create
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApiKeyManager;
