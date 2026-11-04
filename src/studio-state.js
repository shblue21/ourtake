export function creationBlocker({ busy, config, project, sourceCount, prompt, editing }) {
  if (busy) return 'Please wait for the current operation to finish.';
  if (!config || !project) return 'Loading your studio...';
  if (!config.ffmpegReady) return 'Install FFmpeg to create a film. See the setup instructions.';
  if (!sourceCount) return 'Add your footage or explore the example to get started.';
  if (!prompt.trim()) return editing ? 'Enter a change above to continue.' : 'Describe your story above to continue.';
  return '';
}

export function activeVersion(project) {
  return project?.versions.find(v => v.id === project.activeVersionId) || project?.versions.at(-1) || null;
}
