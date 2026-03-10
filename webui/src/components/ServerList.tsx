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
  Badge,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  Delete,
  Edit,
  Add,
  SystemUpdateAlt as UpdateIcon,
  NewReleases as NewReleasesIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import UpdateDialog from './UpdateDialog';
import { Server, VersionInfo } from '../types';

// Get the base URL for SSE connections
function getSSEUrl(serverId: string): string {
  // Use the current host but always use port 14725 and /sse path
  const baseUrl = window.location.origin.replace(/:\d+$/, ':14725');
  return `${baseUrl}/sse/${serverId}`;
}

const ServerList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State for update dialog
  const [updateDialogOpen, setUpdateDialogOpen] = React.useState(false);
  const [selectedServer, setSelectedServer] = React.useState<Server | null>(null);
  const [selectedVersionInfo, setSelectedVersionInfo] = React.useState<VersionInfo | null>(null);

  // Fetch servers
  const { data: servers, isLoading, error, refetch, isFetching } = useQuery<Server[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/api/servers').then((res: { data: Server[] }) => res.data),
    refetchInterval: 5000,
  });

  // Fetch versions
  const { data: versions, refetch: refetchVersions, isFetching: isFetchingVersions } = useQuery<Record<string, VersionInfo>>({
    queryKey: ['versions'],
    queryFn: () => api.get('/api/versions').then((res: { data: Record<string, VersionInfo> }) => res.data),
    refetchInterval: 60000, // Refresh every minute
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/servers/${id}/start`),
    onSuccess: () => {
      refetch();
    },
    onError: (error: Error) => {
      console.error('Failed to start server:', error);
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/servers/${id}/stop`),
    onSuccess: () => {
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

  // Check for updates mutation
  const checkUpdatesMutation = useMutation({
    mutationFn: () => api.post('/api/versions/check'),
    onSuccess: () => {
      refetchVersions();
    },
  });

  // Update server mutation
  const updateServerMutation = useMutation({
    mutationFn: ({ serverId, version }: { serverId: string; version: string }) =>
      api.post(`/api/versions/${serverId}/update`, { version }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['versions'] });
    },
  });

  // Update all outdated servers mutation
  const updateAllMutation = useMutation({
    mutationFn: () => api.post('/api/versions/update-all', { version: 'latest' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['versions'] });
    },
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

  const handleOpenUpdateDialog = (server: Server) => {
    setSelectedServer(server);
    setSelectedVersionInfo(versions?.[server.id] || null);
    setUpdateDialogOpen(true);
  };

  const handleCloseUpdateDialog = () => {
    setUpdateDialogOpen(false);
    setSelectedServer(null);
    setSelectedVersionInfo(null);
  };

  const handleUpdate = async (serverId: string, version: string) => {
    await updateServerMutation.mutateAsync({ serverId, version });
  };

  const handleCheckForUpdates = () => {
    checkUpdatesMutation.mutate();
  };

  const handleUpdateAll = () => {
    if (confirm('Are you sure you want to update all outdated servers to the latest version? Servers will be restarted.')) {
      updateAllMutation.mutate();
    }
  };

  // Count outdated servers
  const outdatedCount = servers?.filter(s => versions?.[s.id]?.isOutdated).length || 0;

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
          {(isFetching || isFetchingVersions) && <CircularProgress size={20} />}
        </Box>
        <Box display="flex" gap={1}>
          <Tooltip title="Check for package updates">
            <Button
              variant="outlined"
              size="small"
              startIcon={checkUpdatesMutation.isPending ? <CircularProgress size={16} /> : <Refresh />}
              onClick={handleCheckForUpdates}
              disabled={checkUpdatesMutation.isPending}
            >
              Check Updates
            </Button>
          </Tooltip>
          {outdatedCount > 0 && (
            <Tooltip title={`Update ${outdatedCount} outdated server(s) to latest version`}>
              <Button
                variant="contained"
                color="warning"
                size="small"
                startIcon={updateAllMutation.isPending ? <CircularProgress size={16} /> : <UpdateIcon />}
                onClick={handleUpdateAll}
                disabled={updateAllMutation.isPending}
              >
                Update All ({outdatedCount})
              </Button>
            </Tooltip>
          )}
          <Tooltip title="Refresh server list">
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
              <TableCell>Version</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {servers?.map((server: Server) => {
              const versionInfo = versions?.[server.id];
              return (
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
                      {server.install?.package || 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      {versionInfo?.installedVersion ? (
                        <Chip
                          label={`v${versionInfo.installedVersion}`}
                          size="small"
                          color={versionInfo?.isOutdated ? 'warning' : 'success'}
                        />
                      ) : versionInfo?.latestVersion ? (
                        <Chip
                          label={`Latest: ${versionInfo.latestVersion}`}
                          size="small"
                          color="info"
                          variant="outlined"
                        />
                      ) : (
                        <Chip
                          label="Unknown"
                          size="small"
                          color="default"
                        />
                      )}
                      {versionInfo?.isOutdated && (
                        <Tooltip title={`Update available: ${versionInfo.latestVersion}`}>
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={() => handleOpenUpdateDialog(server)}
                          >
                            <NewReleasesIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {versionInfo?.checkError && (
                        <Tooltip title={`Error checking version: ${versionInfo.checkError}`}>
                          <Chip label="?" size="small" color="default" />
                        </Tooltip>
                      )}
                    </Box>
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
                    <Tooltip title="Update package">
                      <IconButton
                        onClick={() => handleOpenUpdateDialog(server)}
                        color="primary"
                      >
                        <UpdateIcon />
                      </IconButton>
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
              );
            })}
            {servers?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="text.secondary" sx={{ py: 4 }}>
                    No MCP servers configured. Click "Add Server" to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Update Dialog */}
      <UpdateDialog
        open={updateDialogOpen}
        server={selectedServer}
        versionInfo={selectedVersionInfo}
        onClose={handleCloseUpdateDialog}
        onUpdate={handleUpdate}
      />
    </Box>
  );
};

export default ServerList;
