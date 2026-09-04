localStorage.clear();
sessionStorage.clear();
sessionStorage.setItem('lineage-geni-access-token', 'test-access-token');
window.__geniMockRequests = 0;

(() => {
  const profiles = {
    'profile-9001': {
      id: 'profile-9001',
      guid: '6000000000000009001',
      public: true,
      profile_url: 'https://www.geni.com/people/Ada-Remote/6000000000000009001',
      display_name: 'Ada Remote',
      first_name: 'Ada',
      last_name: 'Remote',
      gender: 'female',
      birth: { date: { year: 1900 } },
      death: { date: { year: 1985 } },
      unions: ['union-9100']
    },
    'profile-9002': {
      id: 'profile-9002',
      guid: '6000000000000009002',
      public: true,
      profile_url: 'https://www.geni.com/people/Alex-Partner/6000000000000009002',
      display_name: 'Alex Partner',
      first_name: 'Alex',
      last_name: 'Partner',
      gender: 'male',
      birth: { date: { year: 1898 } },
      death: { date: { year: 1972 } },
      unions: ['union-9100']
    },
    'profile-9003': {
      id: 'profile-9003',
      guid: '6000000000000009003',
      public: true,
      profile_url: 'https://www.geni.com/people/Bea-Child/6000000000000009003',
      display_name: 'Bea Child',
      first_name: 'Bea',
      last_name: 'Child',
      gender: 'female',
      birth: { date: { year: 1925 } },
      death: { date: { year: 2012 } },
      unions: ['union-9100']
    }
  };
  const unions = {
    'union-9100': {
      id: 'union-9100',
      partners: ['profile-9001', 'profile-9002'],
      children: ['profile-9003'],
      status: 'spouse',
      marriage: { date: { year: 1922 } }
    }
  };

  const profileFor = value => {
    const raw = String(value || '').replace(/^profile-/, '');
    const guid = raw.replace(/^g/i, '');
    if (profiles[`profile-${raw}`]) return profiles[`profile-${raw}`];
    return Object.values(profiles).find(profile => profile.guid === guid) || null;
  };
  const unionFor = value => unions[`union-${String(value || '').replace(/^union-/, '')}`] || null;

  const payloadFor = url => {
    const resource = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
    const ids = String(url.searchParams.get('ids') || '').split(',').filter(Boolean);
    if (resource === 'profile') return { results: ids.map(profileFor).filter(Boolean) };
    if (resource === 'union') return { results: ids.map(unionFor).filter(Boolean) };
    if (resource.startsWith('profile-')) return profileFor(resource) || { error: { message: 'profile not found' } };
    if (resource.startsWith('union-')) return unionFor(resource) || { error: { message: 'union not found' } };
    return { error: { message: `unsupported mocked resource ${resource}` } };
  };

  const originalAppend = document.head.append.bind(document.head);
  document.head.append = (...nodes) => {
    const ordinary = [];
    nodes.forEach(node => {
      if (!(node instanceof HTMLScriptElement) || !String(node.src).startsWith('https://www.geni.com/api/')) {
        ordinary.push(node);
        return;
      }
      window.__geniMockRequests += 1;
      const url = new URL(node.src);
      const callback = url.searchParams.get('callback');
      const payload = payloadFor(url);
      window.setTimeout(() => {
        if (typeof window[callback] === 'function') window[callback](structuredClone(payload));
      }, 5);
    });
    if (ordinary.length) originalAppend(...ordinary);
  };
})();
