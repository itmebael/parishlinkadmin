-- Seed the Diocese of Calbayog parishes so the registration / booking
-- dropdowns have real data to choose from.
--
-- Idempotent: uses ON CONFLICT on parish_name (unique index below) so you
-- can re-run safely to pick up new additions without duplicating existing
-- rows. Edit the list freely before running.
--
-- Prerequisites: sql/parishes.sql (creates public.parishes + indexes) must
-- already be applied. Run after sql/parishes_lookup.sql so list_parishes()
-- returns these rows.

insert into public.parishes (parish_name, address, city, province)
values
  ('Parish of Catbalogan',                             '',                                   'Catbalogan City',     'Samar'),
  ('Cathedral of Sts. Peter and Paul',                 'Our Lady''s Nativity Parish',        'Calbayog City',       'Samar'),
  ('St. Vincent Ferrer Parish',                        'Tinambacan District',                'Calbayog City',       'Samar'),
  ('St. Joseph the Worker Parish - San Policarpo',     'Brgy. San Policarpo',                'Calbayog City',       'Samar'),
  ('St. Joseph the Worker Parish - Hinabangan',        '',                                   'Hinabangan',          'Samar'),
  ('St. Michael the Archangel Parish - Gandara',       '',                                   'Gandara',             'Samar'),
  ('St. Michael the Archangel Parish - Basey',         '',                                   'Basey',               'Samar'),
  ('St. Michael the Archangel Parish - San Sebastian', '',                                   'San Sebastian',       'Samar'),
  ('St. James the Greater Parish - Sta. Margarita',    '',                                   'Sta. Margarita',      'Samar'),
  ('St. James the Greater Parish - Talalora',          '',                                   'Talalora',            'Samar'),
  ('St. James the Apostle Parish - Marabut',           '',                                   'Marabut',             'Samar'),
  ('St. Francis of Assisi Parish - Silanga',           '',                                   'Silanga',             'Samar'),
  ('St. Francis of Assisi Parish - Tarangnan',         '',                                   'Tarangnan',           'Samar'),
  ('St. Isidore the Farmer Parish - Matuguinao',       '',                                   'Matuguinao',          'Samar'),
  ('St. Isidore the Farmer Parish - San Jorge',        '',                                   'San Jorge',           'Samar'),
  ('St. Bartholomew Parish',                           '',                                   'Catbalogan City',     'Samar'),
  ('St. Paschal Baylon Parish',                        '',                                   'Jiabong',             'Samar'),
  ('St. Rose of Lima Parish',                          '',                                   'Villareal',           'Samar'),
  ('Sta. Rita of Cascia Parish',                       '',                                   'Sta. Rita',           'Samar'),
  ('Sts. Peter & Paul Parish - Paranas',               '',                                   'Paranas',             'Samar'),
  ('Most Holy Trinity Parish',                         '',                                   'Calbayog City',       'Samar')
on conflict (lower(btrim(parish_name))) do update
  set address        = excluded.address,
      city           = excluded.city,
      province       = excluded.province,
      updated_at     = now();

-- Sanity check (run manually in SQL editor to verify):
--   select count(*) as total, array_agg(parish_name order by parish_name) as names
--   from public.parishes;
