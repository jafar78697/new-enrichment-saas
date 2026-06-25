import jwt from 'jsonwebtoken';
import { AuthManager } from '@enrichment-saas/auth';
import fetch from 'node-fetch';

const enrichmentSecret = 'jento-enrichment-secret-key-2024-change-this'; // Wait, I need the actual PEM keys.
