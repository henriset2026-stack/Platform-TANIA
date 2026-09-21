-- 01_reference.sql
-- Reference data defined by the PRD. Safe in any environment, including
-- production: these are framework definitions, not business records.
--
-- Idempotent.

-- Capability levels — TANIA_PRD_v2.0.md §7.1.
insert into public.capability_levels (level, name, description) values
  (1, 'Awareness',      'Understands concepts and terminology; cannot yet apply them independently.'),
  (2, 'Foundation',     'Applies the capability on guided or routine work with supervision.'),
  (3, 'Practitioner',   'Applies the capability independently on real work and produces evidence.'),
  (4, 'Advanced',       'Handles complex and ambiguous cases; improves how the capability is applied.'),
  (5, 'Expert / Mentor','Sets direction and develops the capability in others; recognised authority.')
on conflict (level) do nothing;

-- Capability domains — TANIA_PRD_v2.0.md §7.2.
insert into public.capability_domains (code, name, sort_order) values
  ('product',      'Product',      10),
  ('solution',     'Solution',     20),
  ('business',     'Business',     30),
  ('digital',      'Digital',      40),
  ('architecture', 'Architecture', 50),
  ('ai',           'AI',           60),
  ('data',         'Data',         70),
  ('technology',   'Technology',   80),
  ('leadership',   'Leadership',   90),
  ('commercial',   'Commercial',  100),
  ('industry',     'Industry',    110)
on conflict (code) do nothing;

-- NOTE: no performance dimension weights are seeded. PRD §6.1 states weights
-- are configuration, not universal policy, and CLAUDE.md §16 forbids
-- hard-coding them. Weights belong on performance_metrics per period.
--
-- NOTE: no capabilities are seeded. The DPS capability catalogue is real
-- organizational content and must be supplied by Chapter DPS, not invented here.
