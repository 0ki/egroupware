/**
 * Some static options, no need to transfer them over and over.
 * We still need the same thing on the server side to validate, so they
 * have to match.  See Etemplate\Widget\Select::typeOptions()
 * The type specific legacy options wind up in attrs.other, but should be explicitly
 * defined and set.
 *
 * @param {type} widget
 */
import {Et2WidgetWithSelect, find_select_options, SelectOption} from "./Et2Select";
import {sprintf} from "../../egw_action/egw_action_common";
import {Et2SelectReadonly} from "./Et2SelectReadonly";

/**
 * Some options change, or are too complicated to have twice, so we get the
 * options from the server once, then keep them to use if they're needed again.
 * We use the options string to keep the different possibilities (eg. categories
 * for different apps) separate.
 *
 * @param {et2_selectbox} widget Selectbox we're looking at
 * @param {string} options_string
 * @param {Object} attrs Widget attributes (not yet fully set)
 * @returns {Object} Array of options, or empty and they'll get filled in later
 */
export class StaticOptions
{
	cached_server_side(widget : Et2WidgetWithSelect | Et2SelectReadonly, type : string, options_string) : SelectOption[]
	{
		// normalize options by removing trailing commas
		options_string = options_string.replace(/,+$/, '');

		const cache_id = widget.nodeName + '_' + options_string;
		const cache_owner = widget.egw().getCache('Et2Select');
		let cache = cache_owner[cache_id];

		if(typeof cache === 'undefined')
		{
			// Fetch with json instead of jsonq because there may be more than
			// one widget listening for the response by the time it gets back,
			// and we can't do that when it's queued.
			const req = widget.egw().json(
				'EGroupware\\Api\\Etemplate\\Widget\\Select::ajax_get_options',
				[type, options_string, widget.value]
			).sendRequest();
			if(typeof cache === 'undefined')
			{
				cache_owner[cache_id] = req;
			}
			cache = req;
		}
		if(typeof cache.then === 'function')
		{
			// pending, wait for it
			cache.then((response) =>
			{
				cache = cache_owner[cache_id] = response.response[0].data || undefined;
				// Set select_options in attributes in case we get a response before
				// the widget is finished loading (otherwise it will re-set to {})
				//widget.select_options = cache;

				// Avoid errors if widget is destroyed before the timeout
				if(widget && typeof widget.id !== 'undefined')
				{
					widget.set_select_options(find_select_options(widget, {}, widget.options));
				}
			});
			return [];
		}
		else
		{
			// Check that the value is in there
			// Make sure we are not requesting server for an empty value option or
			// other widgets but select-timezone as server won't find anything and
			// it will fall into an infinitive loop, e.g. select-cat widget.
			if(widget.value && widget.value != "" && widget.value != "0" && type == "select-timezone")
			{
				var missing_option = true;
				for(var i = 0; i < cache.length && missing_option; i++)
				{
					if(cache[i].value == widget.value)
					{
						missing_option = false;
					}
				}
				// Try again - ask the server with the current value this time
				if(missing_option)
				{
					delete cache_owner[cache_id];
					return this.cached_server_side(widget, type, options_string);
				}
				else
				{
					if(widget.value && widget && widget.get_value() !== widget.value)
					{
						egw.window.setTimeout(jQuery.proxy(function()
						{
							// Avoid errors if widget is destroyed before the timeout
							if(this.widget && typeof this.widget.id !== 'undefined')
							{
								this.widget.set_value(this.widget.options.value);
							}
						}, {widget: widget}), 1);
					}
				}
			}
			return cache;
		}
	}

	priority(widget : Et2WidgetWithSelect | Et2SelectReadonly) : SelectOption[]
	{
		return [
			{value: "1", label: 'low'},
			{value: "2", label: 'normal'},
			{value: "3", label: 'high'},
			{value: "0", label: 'undefined'}
		];
	}

	bool(widget : Et2WidgetWithSelect | Et2SelectReadonly) : SelectOption[]
	{
		return [
			{value: "0", label: 'no'},
			{value: "1", label: 'yes'}
		];
	}

	month(widget : Et2WidgetWithSelect | Et2SelectReadonly) : SelectOption[]
	{
		return [
			{value: "1", label: 'January'},
			{value: "2", label: 'February'},
			{value: "3", label: 'March'},
			{value: "4", label: 'April'},
			{value: "5", label: 'May'},
			{value: "6", label: 'June'},
			{value: "7", label: 'July'},
			{value: "8", label: 'August'},
			{value: "9", label: 'September'},
			{value: "10", label: 'October'},
			{value: "11", label: 'November'},
			{value: "12", label: 'December'}
		];
	}

	number(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		if(typeof attrs.other != 'object')
		{
			attrs.other = [];
		}
		var options = [];
		var min = typeof (attrs.other[0]) == 'undefined' ? 1 : parseInt(attrs.other[0]);
		var max = typeof (attrs.other[1]) == 'undefined' ? 10 : parseInt(attrs.other[1]);
		var interval = typeof (attrs.other[2]) == 'undefined' ? 1 : parseInt(attrs.other[2]);
		var format = '%d';

		// leading zero specified in interval
		if(attrs.other[2] && attrs.other[2][0] == '0')
		{
			format = '%0' + ('' + interval).length + 'd';
		}
		// Suffix
		if(attrs.other[3])
		{
			format += widget.egw().lang(attrs.other[3]);
		}

		// Avoid infinite loop if interval is the wrong direction
		if((min <= max) != (interval > 0))
		{
			interval = -interval;
		}

		for(var i = 0, n = min; n <= max && i <= 100; n += interval, ++i)
		{
			options.push({value: n, label: sprintf(format, n)});
		}
		return options;
	}

	percent(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		if(typeof attrs.other != 'object')
		{
			attrs.other = [];
		}
		attrs.other[0] = 0;
		attrs.other[1] = 100;
		attrs.other[2] = typeof (attrs.other[2]) == 'undefined' ? 10 : parseInt(attrs.other[2]);
		attrs.other[3] = '%%';
		return this.number(widget, attrs);
	}

	year(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		if(typeof attrs.other != 'object')
		{
			attrs.other = [];
		}
		var t = new Date();
		attrs.other[0] = t.getFullYear() - (typeof (attrs.other[0]) == 'undefined' ? 3 : parseInt(attrs.other[0]));
		attrs.other[1] = t.getFullYear() + (typeof (attrs.other[1]) == 'undefined' ? 2 : parseInt(attrs.other[1]));
		attrs.other[2] = typeof (attrs.other[2]) == 'undefined' ? 1 : parseInt(attrs.other[2]);
		return this.number(widget, attrs);
	}

	day(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		attrs.other = [1, 31, 1];
		return this.number(widget, attrs);
	}

	hour(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		var options = [];
		var timeformat = widget.egw().preference('common', 'timeformat');
		for(var h = 0; h <= 23; ++h)
		{
			options.push({
				value: h,
				label: timeformat == 12 ?
					   ((12 ? h % 12 : 12) + ' ' + (h < 12 ? egw.lang('am') : egw.lang('pm'))) :
					   sprintf('%02d', h)
			});
		}
		return options;
	}

	app(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		var options = ',' + (attrs.other || []).join(',');
		return this.cached_server_side(widget, 'select-app', options);
	}

	cat(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		// Add in application, if not there
		if(typeof attrs.other == 'undefined')
		{
			attrs.other = new Array(4);
		}
		if(typeof attrs.other[3] == 'undefined')
		{
			attrs.other[3] = attrs.application ||
				// When the widget is first created, it doesn't have a parent and can't find it's instanceManager
				(widget.getInstanceManager() && widget.getInstanceManager().app) ||
				widget.egw().app_name();
		}
		var options = (attrs.other || []).join(',');
		return this.cached_server_side(widget, 'select-cat', options);
	}

	country(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		var options = ',';
		return this.cached_server_side(widget, 'select-country', options);
	}

	state(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		var options = attrs.country_code ? attrs.country_code : 'de';
		return this.cached_server_side(widget, 'select-state', options);
	}

	dow(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		var options = ',' + (attrs.other || []).join(',');
		return this.cached_server_side(widget, 'select-dow', options);
	}

	lang(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		var options = ',' + (attrs.other || []).join(',');
		return this.cached_server_side(widget, 'select-lang', options);
	}

	timezone(widget : Et2WidgetWithSelect | Et2SelectReadonly, attrs) : SelectOption[]
	{
		var options = ',' + (attrs.other || []).join(',');
		return this.cached_server_side(widget, 'select-timezone', options);
	}
}
