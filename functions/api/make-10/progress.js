import { handleProgress } from '../../../lib/make10/progress.mjs';
export const onRequest = ({request,env}) => handleProgress(request,env,'progress');
