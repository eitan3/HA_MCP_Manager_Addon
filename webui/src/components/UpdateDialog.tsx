import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { Server, VersionInfo } from '../types';

interface UpdateDialogProps {
  open: boolean;
  server: Server | null;
  versionInfo: VersionInfo | null;
  onClose: () => void;
  onUpdate: (serverId: string, version: string) => Promise<void>;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({
  open,
  server,
  versionInfo,
  onClose,
  onUpdate,
}) => {
  const [selectedVersion, setSelectedVersion] = useState<string>('latest');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedVersion('latest');
      setError(null);
      setIsUpdating(false);
    }
  }, [open]);

  if (!server) return null;

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError(null);
    
    try {
      await onUpdate(server.id, selectedVersion);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  // Build version options with "latest" at the top
  const versionOptions = ['latest'];
  if (versionInfo?.availableVersions) {
    versionOptions.push(...versionInfo.availableVersions.filter(v => v !== 'latest'));
  }

  const getLatestLabel = () => {
    if (versionInfo?.latestVersion) {
      return `latest (${versionInfo.latestVersion})`;
    }
    return 'latest';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Update Server: {server.name}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3, mt: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Package: <strong>{server.install?.package || 'N/A'}</strong>
          </Typography>
          
          <Box display="flex" gap={2} mt={2}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Current Version
              </Typography>
              <Box>
                <Chip
                  label={versionInfo?.installedVersion || 'Unknown'}
                  size="small"
                  color={versionInfo?.isOutdated ? 'warning' : 'default'}
                />
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Latest Version
              </Typography>
              <Box>
                <Chip
                  label={versionInfo?.latestVersion || 'Unknown'}
                  size="small"
                  color="success"
                />
              </Box>
            </Box>
          </Box>
        </Box>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="version-select-label">Select Version</InputLabel>
          <Select
            labelId="version-select-label"
            value={selectedVersion}
            label="Select Version"
            onChange={(e) => setSelectedVersion(e.target.value)}
            disabled={isUpdating}
          >
            {versionOptions.map((version) => (
              <MenuItem key={version} value={version}>
                {version === 'latest' ? getLatestLabel() : version}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
          <Typography variant="body2">
            The server will be restarted to apply the update.
          </Typography>
        </Alert>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {versionInfo?.checkError && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Note: Could not fetch version list. You can still update to "latest".
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isUpdating}>
          Cancel
        </Button>
        <Button
          onClick={handleUpdate}
          variant="contained"
          color="primary"
          disabled={isUpdating}
          startIcon={isUpdating ? <CircularProgress size={16} /> : null}
        >
          {isUpdating ? 'Updating...' : 'Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UpdateDialog;
