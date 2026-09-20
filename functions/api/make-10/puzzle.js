import { handlePuzzleRequest } from '../../../lib/make10/api.mjs';

export const onRequest = ({ request, env }) => handlePuzzleRequest(request, env, 'archive');
