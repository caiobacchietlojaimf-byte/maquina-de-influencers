-- Login com Google: um login Google (claim `sub`) aponta para no máximo uma conta.
-- O índice parcial também acelera a busca por data->>'googleId' no callback.
create unique index if not exists mi_users_google_id
  on public.mi_users ((data->>'googleId'))
  where data->>'googleId' is not null;
