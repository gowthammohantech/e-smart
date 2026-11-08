import { useRemoteMeta } from './meta';

/**
 * The app works only against the server. With no connection nothing can be saved: save buttons are
 * greyed out and the header says so. What is already on screen stays readable.
 */
export const canWrite = (online: boolean = useRemoteMeta.getState().online) => online;
export const useCanWrite = () => useRemoteMeta((s) => s.online);
