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
  Chip,
  Button,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  Delete,
  Edit,
  Add,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

interface Server {
  id: string;
  name: string;
  enabled: boolean;
  transport: string;
  install: {
    type: string;
    package: string;
  };
  status?: {
    running: boolean;
    error?: string;
  };
}

// Get the base URL for SSE connections
function getSSEUrl(serverId: string): string {
  // Use the current host but always use port 14725 and /sse path
  const baseUrl = window.location.origin.replace(/:\d+$/, ':14725');
  return `${baseUrl}/sse/${serverId}`;
}

const ServerList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: servers, isLoading, error, refetch, isFetching } = useQuery<Server[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/api/servers').then((res: { data: Server[] }) => res.data),
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/servers/${id}/start`),
    onSuccess: () => {
      // Immediately refetch to get updated status
      refetch();
    },
    onError: (error: Error) => {
      console.error('Failed to start server:', error);
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/servers/${id}/stop`),
    onSuccess: () => {
      // Immediately refetch to get updated status
      refetch();
    },
    onError: (error: Error) => {
      console.error('Failed to stop server:', error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/servers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['servers'] }),
  });

  // Track which server is currently being toggled
  const [togglingServer, setTogglingServer] = React.useState<string | null>(null);

  const handleStartStop = async (server: Server) => {
    setTogglingServer(server.id);
    try {
      if (server.status?.running) {
        await stopMutation.mutateAsync(server.id);
      } else {
        await startMutation.mutateAsync(server.id);
      }
    } finally {
      setTogglingServer(null);
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Typography color="error">Error: {(error as Error).message}</Typography>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h5">MCP Servers</Typography>
          {isFetching && <CircularProgress size={20} />}
        </Box>
        <Box display="flex" gap={1}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => refetch()} disabled={isFetching}>
              <Refresh />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/servers/new')}
          >
            Add Server
          </Button>
        </Box>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Transport</TableCell>
              <TableCell>SSE URL</TableCell>
              <TableCell>Package</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {servers?.map((server: Server) => (
              <TableRow key={server.id}>
                <TableCell>{server.name}</TableCell>
                <TableCell>
                  <Chip label={server.transport} size="small" />
                </TableCell>
                <TableCell>
                  <Tooltip title="Click to copy">
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        '&:hover': { textDecoration: 'underline' }
                      }}
                      onClick={() => {
                        navigator.clipboard.writeText(getSSEUrl(server.id));
                      }}
                    >
                      /sse/{server.id}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap>
                    {server.install.package}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={server.status?.running ? 'Running' : 'Stopped'}
                    color={server.status?.running ? 'success' : 'default'}
                    size="small"
                  />
                  {server.status?.error && (
                    <Tooltip title={server.status.error}>
                      <Chip label="Error" color="error" size="small" sx={{ ml: 1 }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={server.status?.running ? 'Stop' : 'Start'}>
                    <span>
                      <IconButton
                        onClick={() => handleStartStop(server)}
                        color={server.status?.running ? 'error' : 'success'}
                        disabled={togglingServer === server.id}
                      >
                        {togglingServer === server.id ? (
                          <CircularProgress size={24} />
                        ) : server.status?.running ? (
                          <Stop />
                        ) : (
                          <PlayArrow />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton onClick={() => navigate(`/servers/${server.id}/edit`)}>
                      <Edit />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this server?')) {
                          deleteMutation.mutate(server.id);
                        }
                      }}
                      color="error"
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {servers?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="text.secondary" sx={{ py: 4 }}>
                    No MCP servers configured. Click "Add Server" to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ServerList;
