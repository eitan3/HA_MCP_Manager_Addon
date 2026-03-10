import React from 'react';
import { Box, Paper, Typography, Grid, Card, CardContent, CardHeader, Chip, Button, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { PlayArrow, Stop, Refresh as RefreshIcon, Storage as ServerIcon, NewReleases as NewReleasesIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

interface ServerStatus {
  running: boolean;
  startedAt?: string;
  error?: string;
  lastActivity?: string;
}

interface VersionInfo {
  installedVersion: string | null;
  latestVersion: string | null;
  isOutdated: boolean;
  checkError?: string;
}

interface Server {
  id: string;
  name: string;
  enabled: boolean;
  transport: string;
  status?: ServerStatus;
}

interface AddonStatus {
  uptime: number;
  version: string;
  serversTotal: number;
  serversRunning: number;
}

const Dashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: servers, isLoading: serversLoading, error: serversError, refetch: refetchServers } = useQuery<Server[], Error>({
    queryKey: ['servers'],
    queryFn: () => api.get('/api/servers').then(res => res.data),
    refetchInterval: 5000,
  });

  const { data: status, isLoading: statusLoading } = useQuery<AddonStatus, Error>({
    queryKey: ['status'],
    queryFn: () => api.get('/api/settings/status').then(res => res.data),
    refetchInterval: 5000,
  });

  // Fetch versions
  const { data: versions } = useQuery<Record<string, VersionInfo>>({
    queryKey: ['versions'],
    queryFn: () => api.get('/api/versions').then((res: { data: Record<string, VersionInfo> }) => res.data),
    refetchInterval: 60000, // Refresh every minute
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/servers/${id}/start`),
    onSuccess: () => {
      // Refetch servers to get updated status
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/servers/${id}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const handleStartStop = (server: Server) => {
    if (server.status?.running) {
      stopMutation.mutate(server.id);
    } else {
      startMutation.mutate(server.id);
    }
  };

  if (serversLoading || statusLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (serversError) {
    return (
      <Box>
        <Typography color="error">Error loading dashboard: {serversError.message}</Typography>
        <Button onClick={() => refetchServers()} sx={{ mt: 2 }}>
          Retry
        </Button>
      </Box>
    );
  }

  const runningServers = servers?.filter(s => s.status?.running) || [];
  const stoppedServers = servers?.filter(s => !s.status?.running) || [];
  const outdatedServers = servers?.filter(s => versions?.[s.id]?.isOutdated) || [];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Overview</Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={() => refetchServers()}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>
      
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3">{servers?.length || 0}</Typography>
            <Typography variant="body2" color="text.secondary">Total Servers</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.dark', color: 'white' }}>
            <Typography variant="h3">{runningServers.length}</Typography>
            <Typography variant="body2">Running</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'error.dark', color: 'white' }}>
            <Typography variant="h3">{stoppedServers.length}</Typography>
            <Typography variant="body2">Stopped</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper 
            sx={{ 
              p: 2, 
              textAlign: 'center', 
              bgcolor: outdatedServers.length > 0 ? 'warning.dark' : 'grey.800', 
              color: 'white',
              cursor: outdatedServers.length > 0 ? 'pointer' : 'default',
            }}
            onClick={() => outdatedServers.length > 0 && navigate('/servers')}
          >
            <Typography variant="h3">{outdatedServers.length}</Typography>
            <Typography variant="body2">
              {outdatedServers.length > 0 ? 'Updates Available' : 'Up to Date'}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
        Servers
      </Typography>
      
      {servers?.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No MCP servers configured yet. Go to the Servers page to add one.
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {servers?.map(server => {
            const versionInfo = versions?.[server.id];
            return (
              <Grid item xs={12} sm={6} md={4} key={server.id}>
                <Card>
                  <CardHeader
                    avatar={<ServerIcon />}
                    title={server.name}
                    subheader={
                      <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                        <Chip 
                          label={server.transport} 
                          size="small" 
                          color="primary" 
                          variant="outlined"
                        />
                      </Box>
                    }
                    action={
                      <Button 
                        size="small" 
                        color={server.status?.running ? 'error' : 'success'} 
                        startIcon={server.status?.running ? <Stop /> : <PlayArrow />}
                        onClick={() => handleStartStop(server)}
                        disabled={startMutation.isPending || stopMutation.isPending}
                      >
                        {server.status?.running ? 'Stop' : 'Start'}
                      </Button>
                    }
                  />
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip 
                          label={server.status?.running ? 'Running' : 'Stopped'} 
                          color={server.status?.running ? 'success' : 'default'}
                          size="small"
                        />
                        {server.status?.error && (
                          <Tooltip title={server.status.error}>
                            <Chip 
                              label="Error" 
                              color="error" 
                              size="small"
                            />
                          </Tooltip>
                        )}
                      </Box>
                      {/* Version info */}
                      {versionInfo && (
                        <Box display="flex" alignItems="center" gap={0.5}>
                          {versionInfo.installedVersion ? (
                            <Chip
                              label={`v${versionInfo.installedVersion}`}
                              size="small"
                              color={versionInfo.isOutdated ? 'warning' : 'success'}
                              variant="outlined"
                            />
                          ) : versionInfo.latestVersion ? (
                            <Chip
                              label={`v${versionInfo.latestVersion}`}
                              size="small"
                              color="info"
                              variant="outlined"
                            />
                          ) : null}
                          {versionInfo.isOutdated && (
                            <Tooltip title={`Update available: ${versionInfo.latestVersion}`}>
                              <NewReleasesIcon fontSize="small" color="warning" />
                            </Tooltip>
                          )}
                        </Box>
                      )}
                    </Box>
                    {server.status?.startedAt && server.status.running && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Started: {new Date(server.status.startedAt).toLocaleString()}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default Dashboard;
