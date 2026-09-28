import React, { useState } from 'react';
import { HexInput, AccountSelector } from '../components';
import { useComposer } from '../composer-context';

export const ClaimClaimableBalanceForm = () => {
  const { addOperation } = useComposer();
  const [balanceId, setBalanceId] = useState('');
  const [destination, setDestination] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addOperation('claim_claimable_balance', {
      balanceId,
      destination
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <HexInput
        label="Claimable Balance ID"
        value={balanceId}
        onChange={setBalanceId}
        required
        length={32}
      />
      <AccountSelector
        label="Destination"
        value={destination}
        onChange={setDestination}
        required
        allowMuxed
      />
      <button type="submit">Add Operation</button>
    </form>
  );
};