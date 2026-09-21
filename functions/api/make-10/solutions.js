import { handleSolutions } from '../../../lib/make10/solutions.mjs';
export const onRequest = ({request,env}) => handleSolutions(request,env);
