import { handlePlayer } from '../../../lib/make10/identity.mjs';
export const onRequest = ({request,env}) => handlePlayer(request,env);
