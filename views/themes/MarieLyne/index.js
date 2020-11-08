/* eslint-disable prefer-arrow-callback, no-var, no-tabs */
$(document).ready(function () {
  // Add specific code to this theme here
  // *** PRODUCT SLIDER ***
  $('#autoWidth').lightSlider({
    autoWidth: true,
    loop: true,
    onSliderLoad: function () {
      $('#autoWidth').removeClass('cS-hidden');
    },
  });

  // *** CAROUSEL ***
  $('.skitter').skitter({
    fullscreen: false,
    theme: 'minimalist',
    navigation: true,
    dots: false,
    label: false,
  });

  // *** CURRENCY SELECTER ***
  $('#sm-close').click(function () {
    $('.currency-box').addClass('sm-collapse');
    $('#sm-open').delay(300).css('left', '0');
    alert('SOLID');
  });

  $('#sm-open').click(function () {
    alert('SOLID');
    $('#sm-open').css('left', '-60px');
    $('.currency-box').removeClass('sm-collapse');
  });
});
