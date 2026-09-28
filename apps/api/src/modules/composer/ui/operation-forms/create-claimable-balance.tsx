import React, { useState } from 'react';
import { AssetSelector, DecimalInput, AccountSelector } from '../components';
import { useComposer } from '../composer-context';
import { Asset } from '../../stellar/stellar.types';

export const CreateClaimableBalanceForm = () => {
  const { addOperation } = useComposer();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addOperation('create_claimable_balance', {
      asset,
      amount,
      destination
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <AssetSelector value={asset} onChange={setAsset} required />
      <DecimalInput
        label="Amount"
        value={amount}
        onChange={setAmount}
        required
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