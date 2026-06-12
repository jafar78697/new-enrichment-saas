import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { socialApi } from '../services/api';

export default function YouTubeCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Connecting to YouTube...');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      toast.error('Google Auth Failed: ' + error);
      navigate('/outreach/reels');
      return;
    }

    if (!code) {
      toast.error('No authorization code found');
      navigate('/outreach/reels');
      return;
    }

    setStatus('Verifying credentials...');

    socialApi.connectYouTube(code)
      .then(() => {
        toast.success('YouTube Channel connected successfully!');
        navigate('/outreach/reels?youtube_connected=true');
      })
      .catch((err) => {
        console.error('YouTube connection error:', err);
        toast.error('Failed to connect YouTube channel.');
        navigate('/outreach/reels');
      });
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm w-full">
        <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-6"></div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Please wait</h2>
        <p className="text-gray-500">{status}</p>
      </div>
    </div>
  );
}
