import Ember from 'ember';
import layout from '../templates/components/liquid-each';
import RSVP from 'rsvp';
import matchReplacements from 'liquid-fire/match-replacements';

export default Ember.Component.extend({
  layout,
  tagName: '',
  init() {
    this._super();
    this._entering = [];
    this._current = [];
    this._leaving = [];
    this._prevItems = [];
  },
  didReceiveAttrs() {
    let prevItems = this._prevItems;
    let items = this.get('items');
    this._prevItems = items.slice();

    let current = this._current.map(component => ({ component, measurements: component.measure(), item: component.item }));
    current.forEach(({ measurements }) => measurements.lock());

    Ember.run.schedule('afterRender', () => {
      let [kept, removed] = partition(current, entry => this._leaving.indexOf(entry.component) < 0);

      // Briefly unlock everybody
      kept.forEach(({ measurements }) => measurements.unlock());
      // so we can measure the final static layout
      kept.forEach(entry => { entry.newMeasurements = entry.component.measure(); });
      let inserted = this._entering.map(component => ({ component, measurements: component.measure(), item: component.item }));
      // Then lock everything down
      kept.forEach(({ measurements }) => measurements.lock());
      inserted.forEach(({ measurements }) => measurements.lock());
      // Including ghost copies of the deleted components
      removed.forEach(({ measurements }) => {
        measurements.append();
        measurements.lock();
      });

      let replaced;
      [inserted, removed, replaced] = matchReplacements(prevItems, items, inserted, kept, removed);

      RSVP.all([].concat(
        inserted.map(({ measurements }) => measurements.enter()),
        kept.map(({ measurements, newMeasurements }) => measurements.move(newMeasurements)),
        removed.map(({ measurements }) => measurements.exit()),
        replaced.map(([older, newer]) => newer.measurements.replace(older.measurements))
      )).then(() => {
        kept.forEach(({ measurements }) => measurements.unlock());
        inserted.forEach(({ measurements }) => measurements.unlock());
        replaced.forEach(([older, { measurements }]) => measurements.unlock());
        this.finalizeAnimation(kept, inserted, replaced);
      });
    });
  },

  finalizeAnimation(kept, inserted, replaced) {
    this._current = kept.concat(inserted).concat(replaced.map(([older, newer]) => newer)).map(entry => entry.component);
    this._entering = [];
    this._leaving = [];
  },

  actions: {
    childEntering(component) {
      this._entering.push(component);
    },
    childLeaving(component) {
      this._leaving.push(component);
    }
  }

}).reopenClass({
  positionalParams: ['items']
});


function partition(list, pred) {
  let matched = [];
  let unmatched = [];
  list.forEach(entry => {
    if (pred(entry)) {
      matched.push(entry);
    } else {
      unmatched.push(entry);
    }
  });
  return [matched, unmatched];
}