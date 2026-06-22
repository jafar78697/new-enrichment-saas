// InstagramDashboard uses the same FacebookDashboard component
// but passes platform="instagram" to get IG-specific theming and data
import React from 'react';
import FacebookDashboard from './FacebookDashboard';

export default function InstagramDashboard() {
  return <FacebookDashboard platform="instagram" />;
}
